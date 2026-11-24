import Foundation
import Security

/// Non-synchronizing, device-only Keychain storage, isolated by bundle identity.
final class AuthSecureStore {
    private let service: String

    init(applicationId: String) { service = applicationId + ".auth.v1" }

    func get(_ key: String) throws -> String? {
        var query = try match(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else { throw AuthBridgeError.storage }
        return value
    }

    func set(_ key: String, value: String) throws {
        let query = try match(key)
        let data = Data(value.utf8)
        guard data.count <= 131072 else { throw AuthBridgeError.storage }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        let updated = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updated == errSecItemNotFound {
            let inserted = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil)
            guard inserted == errSecSuccess else { throw AuthBridgeError.storage }
        } else if updated != errSecSuccess { throw AuthBridgeError.storage }
    }

    func remove(_ key: String) throws {
        let status = SecItemDelete(try match(key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw AuthBridgeError.storage }
    }

    private func match(_ key: String) throws -> [String: Any] {
        guard ["auth-session", "auth-transaction"].contains(key), !service.hasPrefix(".auth") else {
            throw AuthBridgeError.storage
        }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecAttrSynchronizable as String: false
        ]
    }
}
