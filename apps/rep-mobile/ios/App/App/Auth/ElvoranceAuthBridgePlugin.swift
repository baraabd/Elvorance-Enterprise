import Capacitor
import Foundation

@objc(ElvoranceAuthBridgePlugin)
public final class ElvoranceAuthBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ElvoranceAuthBridgePlugin"
    public let jsName = "ElvoranceAuthBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAuthorization", returnType: CAPPluginReturnPromise)
    ]
    private let store = AuthSecureStore(applicationId: Bundle.main.bundleIdentifier ?? "")
    private let browser = AuthBrowserSession()
    private let storageQueue = DispatchQueue(label: "com.elvorance.rep.auth.storage")

    @objc func get(_ call: CAPPluginCall) {
        storageQueue.async {
            do {
                guard let key = call.getString("key") else { throw AuthBridgeError.storage }
                let value: Any = try self.store.get(key).map { $0 as Any } ?? NSNull()
                call.resolve(["value": value])
            } catch { call.reject("Secure storage is unavailable", AuthBridgeError.storage.code) }
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        storageQueue.async {
            do {
                guard let key = call.getString("key"), let value = call.getString("value") else { throw AuthBridgeError.storage }
                try self.store.set(key, value: value)
                call.resolve()
            } catch { call.reject("Secure storage write failed", AuthBridgeError.storage.code) }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        storageQueue.async {
            do {
                guard let key = call.getString("key") else { throw AuthBridgeError.storage }
                try self.store.remove(key)
                call.resolve()
            } catch { call.reject("Secure storage removal failed", AuthBridgeError.storage.code) }
        }
    }

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            do {
                guard let endpoint = self.getConfig().getString("authorizationEndpoint"),
                      let applicationId = Bundle.main.bundleIdentifier,
                      let value = call.getString("url"), let redirect = call.getString("redirectUri"),
                      let window = self.bridge?.viewController?.view.window else { throw AuthBridgeError.configuration }
                let policy = try AuthRedirect(applicationId: applicationId, authorizationEndpoint: endpoint)
                let url = try policy.authorization(value, redirect: redirect)
                self.browser.start(url: url, policy: policy, window: window) { result in
                    switch result {
                    case .success(let callback): call.resolve(["callbackUrl": callback.absoluteString])
                    case .failure(let error): call.reject("Authorization did not complete", error.code)
                    }
                }
            } catch { call.reject("Authorization configuration is invalid", AuthBridgeError.configuration.code) }
        }
    }

    @objc func cancelAuthorization(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.browser.cancel(); call.resolve() }
    }
}
