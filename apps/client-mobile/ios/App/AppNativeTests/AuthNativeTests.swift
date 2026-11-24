import XCTest
import UIKit
@testable import App

final class AuthNativeTests: XCTestCase {
    private let redirect = "com.elvorance.client.staging:/oauth2redirect"
    private let endpoint = "https://identity.example.test/realms/elvorance-staging/protocol/openid-connect/auth"
    private var store: AuthSecureStore!
    private var storageId: String!

    override func setUpWithError() throws {
        XCTAssertEqual(Bundle.main.bundleIdentifier, "com.elvorance.client.staging", "Native tests must run in staging")
        storageId = "com.elvorance.client.staging.tests." + UUID().uuidString
        store = AuthSecureStore(applicationId: storageId)
    }

    override func tearDownWithError() throws {
        try store.remove("auth-session")
        try store.remove("auth-transaction")
    }

    @MainActor func testHostRegistersSecureAuthBridge() {
        let controller = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .compactMap { $0.rootViewController as? ClientBridgeViewController }
            .first
        XCTAssertNotNil(controller, "The application must use its native bridge controller")
        XCTAssertNotNil(controller?.bridge?.plugin(withName: "ElvoranceAuthBridge"))
    }

    func testKeychainRoundTripIsolationAndRemoval() throws {
        let token = "synthetic-unit-test-token"
        try store.set("auth-session", value: token)
        XCTAssertEqual(try AuthSecureStore(applicationId: storageId).get("auth-session"), token)
        XCTAssertNil(try AuthSecureStore(applicationId: storageId + ".other").get("auth-session"))
        XCTAssertNil(try store.get("auth-transaction"))
        try store.remove("auth-session")
        XCTAssertNil(try store.get("auth-session"))
        XCTAssertThrowsError(try store.set("unknown", value: token))
        XCTAssertThrowsError(try store.set("auth-session", value: String(repeating: "x", count: 131073)))
    }

    func testCallbackRejectsWrongAppAndEncodedPath() throws {
        let policy = try AuthRedirect(applicationId: "com.elvorance.client.staging", authorizationEndpoint: endpoint)
        XCTAssertTrue(policy.acceptsCallback(URL(string: redirect + "?code=code&state=state")!))
        for invalid in [
            "com.elvorance.client:/oauth2redirect?code=x",
            "com.elvorance.client.staging://attacker/oauth2redirect?code=x",
            "com.elvorance.client.staging:/%6fauth2redirect?code=x",
            redirect + "?code=x#fragment", redirect
        ] { XCTAssertFalse(policy.acceptsCallback(URL(string: invalid)!), invalid) }
    }

    func testAuthorizationPinsHttpsEndpointAndRequiresPkce() throws {
        let policy = try AuthRedirect(applicationId: "com.elvorance.client.staging", authorizationEndpoint: endpoint)
        var components = URLComponents(string: endpoint)!
        components.queryItems = [
            URLQueryItem(name: "redirect_uri", value: redirect),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: String(repeating: "A", count: 43))
        ]
        let valid = components.url!.absoluteString
        XCTAssertNoThrow(try policy.authorization(valid, redirect: redirect))
        for invalid in [
            valid.replacingOccurrences(of: "https:", with: "http:"),
            valid.replacingOccurrences(of: "identity.example.test", with: "attacker.example.test"),
            valid.replacingOccurrences(of: "S256", with: "plain"),
            valid + "&response_type=token", valid + "#fragment"
        ] { XCTAssertThrowsError(try policy.authorization(invalid, redirect: redirect)) }
    }
}
