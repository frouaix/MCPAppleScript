import AppKit
import Contacts
import Foundation

struct ContactValue: Decodable {
    let label: String?
    let value: String
}

struct ContactsRequest: Decodable {
    let operation: String
    let groupId: String?
    let personId: String?
    let query: String?
    let limit: Int?
    let offset: Int?
    let firstName: String?
    let lastName: String?
    let organization: String?
    let jobTitle: String?
    let emails: [ContactValue]?
    let phones: [ContactValue]?
}

let contactSummaryKeys: [CNKeyDescriptor] = [
    CNContactIdentifierKey as CNKeyDescriptor,
    CNContactGivenNameKey as CNKeyDescriptor,
    CNContactFamilyNameKey as CNKeyDescriptor,
    CNContactOrganizationNameKey as CNKeyDescriptor,
]
let contactDetailKeys = contactSummaryKeys + [
    CNContactJobTitleKey as CNKeyDescriptor,
    CNContactEmailAddressesKey as CNKeyDescriptor,
    CNContactPhoneNumbersKey as CNKeyDescriptor,
]

func contactName(_ contact: CNContact) -> String {
    let name = [contact.givenName, contact.familyName].filter { !$0.isEmpty }.joined(separator: " ")
    return name.isEmpty ? contact.organizationName : name
}

func contactMatchesQuery(_ contact: CNContact, query: String) -> Bool {
    let values = [contactName(contact), contact.organizationName] +
        contact.emailAddresses.map { $0.value as String } +
        contact.phoneNumbers.map { $0.value.stringValue }
    return values.contains { $0.localizedCaseInsensitiveContains(query) }
}

func contactSummary(_ contact: CNContact) -> [String: Any] {
    return [
        "id": contact.identifier,
        "name": contactName(contact),
        "type": "person",
        "properties": [
            "firstName": contact.givenName,
            "lastName": contact.familyName,
            "organization": contact.organizationName,
        ],
    ]
}

func contactDetails(_ contact: CNContact) -> [String: Any] {
    var result = contactSummary(contact)
    let emails: [[String: Any]] = contact.emailAddresses.map {
        ["label": $0.label as Any? ?? NSNull(), "value": $0.value as String]
    }
    let phones: [[String: Any]] = contact.phoneNumbers.map {
        ["label": $0.label as Any? ?? NSNull(), "value": $0.value.stringValue]
    }
    result["properties"] = [
        "firstName": contact.givenName,
        "lastName": contact.familyName,
        "organization": contact.organizationName,
        "jobTitle": contact.jobTitle,
        "emails": emails,
        "phones": phones,
    ]
    return result
}

func validateContactsRequest(_ request: ContactsRequest) throws {
    let operations = ["contacts.list_groups", "contacts.list_people", "contacts.get_person",
                      "contacts.search_people", "contacts.create_person", "contacts.update_person",
                      "contacts.delete_person", "contacts.show"]
    guard operations.contains(request.operation) else { try fail("Unsupported Contacts operation.") }
    if ["contacts.get_person", "contacts.update_person", "contacts.delete_person"].contains(request.operation) {
        guard let id = request.personId, !id.isEmpty else { try fail("Contact ID is required.") }
    }
    if request.operation == "contacts.create_person" {
        let names = [request.firstName, request.lastName, request.organization]
        guard names.contains(where: { !($0 ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            try fail("A first name, last name, or organization is required.")
        }
    }
    if request.operation == "contacts.update_person" &&
        request.firstName == nil && request.lastName == nil && request.organization == nil &&
        request.jobTitle == nil && request.emails == nil && request.phones == nil {
        try fail("At least one contact property is required.")
    }
    if request.operation == "contacts.search_people" && (request.query?.isEmpty ?? true) {
        try fail("Search query is required.")
    }
    guard (1...200).contains(request.limit ?? 50), (request.offset ?? 0) >= 0 else {
        try fail("Invalid Contacts pagination.")
    }
    for value in (request.emails ?? []) + (request.phones ?? []) {
        guard !value.value.isEmpty else { try fail("Email and phone values cannot be empty.") }
    }
}

func applyContactChanges(_ request: ContactsRequest, to contact: CNMutableContact) {
    if let value = request.firstName { contact.givenName = value }
    if let value = request.lastName { contact.familyName = value }
    if let value = request.organization { contact.organizationName = value }
    if let value = request.jobTitle { contact.jobTitle = value }
    if let values = request.emails {
        contact.emailAddresses = values.map { CNLabeledValue(label: $0.label, value: $0.value as NSString) }
    }
    if let values = request.phones {
        contact.phoneNumbers = values.map { CNLabeledValue(label: $0.label, value: CNPhoneNumber(stringValue: $0.value)) }
    }
}

func executeContactsRequest(_ request: ContactsRequest) async throws -> Any {
    try validateContactsRequest(request)
    if request.operation == "contacts.show" {
        guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Contacts") else {
            try fail("Contacts app not found.")
        }
        _ = try await NSWorkspace.shared.openApplication(at: url, configuration: NSWorkspace.OpenConfiguration())
        return ["shown": true]
    }
    let store = CNContactStore()
    let granted = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Bool, Error>) in
        store.requestAccess(for: .contacts) { granted, error in
            if let error = error { continuation.resume(throwing: error) }
            else { continuation.resume(returning: granted) }
        }
    }
    guard granted else {
        try fail("Contacts access denied. Enable access in System Settings > Privacy & Security > Contacts.")
    }
    return try executeContacts(request, store: store)
}

func executeContacts(_ request: ContactsRequest, store: CNContactStore) throws -> Any {
    switch request.operation {
    case "contacts.list_groups":
        return try store.groups(matching: nil).map {
            ["id": $0.identifier, "name": $0.name, "type": "group"]
        }
    case "contacts.list_people", "contacts.search_people":
        let searching = request.operation == "contacts.search_people"
        let fetch = CNContactFetchRequest(keysToFetch: searching ? contactDetailKeys : contactSummaryKeys)
        if let groupId = request.groupId, !groupId.isEmpty {
            let groups = try store.groups(matching: CNGroup.predicateForGroups(withIdentifiers: [groupId]))
            guard !groups.isEmpty else { try fail("Contact group not found; list groups again.") }
            fetch.predicate = CNContact.predicateForContactsInGroup(withIdentifier: groupId)
        }
        var contacts: [CNContact] = []
        try store.enumerateContacts(with: fetch) { contact, _ in
            if let query = request.query, searching {
                if !contactMatchesQuery(contact, query: query) { return }
            }
            contacts.append(contact)
        }
        contacts.sort {
            let order = contactName($0).localizedStandardCompare(contactName($1))
            return order == .orderedSame ? $0.identifier < $1.identifier : order == .orderedAscending
        }
        let offset = request.offset ?? 0
        let start = min(offset, contacts.count)
        let end = start + min(request.limit ?? (searching ? 20 : 50), contacts.count - start)
        return ["total": contacts.count, "offset": offset, "hasMore": end < contacts.count,
                "items": contacts[start..<end].map(contactSummary)] as [String: Any]
    case "contacts.get_person", "contacts.create_person", "contacts.update_person", "contacts.delete_person":
        let contact: CNMutableContact
        let save = CNSaveRequest()
        if request.operation == "contacts.create_person" {
            contact = CNMutableContact()
            if let groupId = request.groupId, !groupId.isEmpty {
                let groups = try store.groups(matching: CNGroup.predicateForGroups(withIdentifiers: [groupId]))
                let containers = try store.containers(matching: CNContainer.predicateForContainerOfGroup(withIdentifier: groupId))
                guard groups.count == 1, let group = groups.first, containers.count == 1, let container = containers.first else {
                    try fail("Contact group or its account is unavailable; list groups again.")
                }
                save.add(contact, toContainerWithIdentifier: container.identifier)
                save.addMember(contact, to: group)
            } else {
                save.add(contact, toContainerWithIdentifier: nil)
            }
        } else {
            guard let id = request.personId else { try fail("Contact ID is required.") }
            let found = try store.unifiedContact(withIdentifier: id, keysToFetch: contactDetailKeys)
            if request.operation == "contacts.get_person" { return contactDetails(found) }
            guard let mutable = found.mutableCopy() as? CNMutableContact else {
                try fail("Could not edit contact.")
            }
            contact = mutable
        }
        if request.operation == "contacts.delete_person" {
            let name = contactName(contact)
            save.delete(contact)
            try store.execute(save)
            return ["deleted": true, "name": name]
        }
        applyContactChanges(request, to: contact)
        if request.operation == "contacts.create_person" &&
            contact.givenName.isEmpty && contact.familyName.isEmpty {
            contact.contactType = .organization
        }
        if request.operation == "contacts.update_person" { save.update(contact) }
        try store.execute(save)
        return contactDetails(contact)
    default:
        try fail("Unsupported Contacts operation.")
    }
}
