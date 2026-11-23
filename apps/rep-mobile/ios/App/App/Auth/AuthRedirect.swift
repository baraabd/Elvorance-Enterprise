import Foundation

enum AuthBridgeError: Error {
    case configuration, storage, cancelled, inProgress, unavailable, timeout

    var code: String {
        switch self {
        case .configuration: return "AUTH_CONFIGURATION_ERROR"
        case .storage: return "AUTH_STORAGE_ERROR"
        case .cancelled: return "AUTH_CANCELLED"
        case .inProgress: return "AUTH_IN_PROGRESS"
        case .unavailable: return "AUTH_BROWSER_UNAVAILABLE"
        case .timeout: return "AUTH_TIMEOUT"
        }
    }
}

/// Pins native authorization to the packaged HTTPS endpoint and this app's callback.
struct AuthRedirect {
    let redirectUri: String
    private let endpoint: URLComponents

    init(applicationId: String, authorizationEndpoint: String) throws {
        guard ["com.elvorance.rep", "com.elvorance.rep.staging"].contains(applicationId),
              let endpoint = URLComponents(string: authorizationEndpoint),
              Self.isHTTPS(endpoint), endpoint.query == nil else {
            throw AuthBridgeError.configuration
        }
        self.endpoint = endpoint
        redirectUri = applicationId + ":/oauth2redirect"
    }

    func authorization(_ value: String, redirect: String) throws -> URL {
        guard redirect == redirectUri, let candidate = URLComponents(string: value),
              Self.isHTTPS(candidate), candidate.host?.lowercased() == endpoint.host?.lowercased(),
              candidate.port == endpoint.port, candidate.percentEncodedPath == endpoint.percentEncodedPath,
              let url = candidate.url else { throw AuthBridgeError.configuration }
        var parameters: [String: String] = [:]
        for item in candidate.queryItems ?? [] {
            guard parameters[item.name] == nil, let value = item.value else { throw AuthBridgeError.configuration }
            parameters[item.name] = value
        }
        guard parameters["redirect_uri"] == redirectUri, parameters["response_type"] == "code",
              parameters["code_challenge_method"] == "S256",
              let challenge = parameters["code_challenge"],
              challenge.range(of: "^[A-Za-z0-9_-]{43,128}$", options: .regularExpression) != nil else {
            throw AuthBridgeError.configuration
        }
        return url
    }

    func acceptsCallback(_ url: URL) -> Bool {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.query != nil, parts.fragment == nil, parts.host == nil else { return false }
        return url.absoluteString.components(separatedBy: "?").first == redirectUri
    }

    private static func isHTTPS(_ value: URLComponents) -> Bool {
        value.scheme == "https" && !(value.host ?? "").isEmpty
            && value.user == nil && value.password == nil && value.fragment == nil
    }
}
