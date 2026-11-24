import AuthenticationServices
import UIKit

/// Uses the OS authentication browser; credentials never enter the app's WebView.
final class AuthBrowserSession: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private var completion: ((Result<URL, AuthBridgeError>) -> Void)?
    private var timeout: DispatchWorkItem?
    private var anchor: UIWindow?
    private var generation = UUID()

    func start(url: URL, policy: AuthRedirect, window: UIWindow,
               completion: @escaping (Result<URL, AuthBridgeError>) -> Void) {
        guard session == nil else { completion(.failure(.inProgress)); return }
        self.completion = completion
        anchor = window
        generation = UUID()
        let current = generation
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: URL(string: policy.redirectUri)?.scheme) {
            [weak self] callback, error in
            DispatchQueue.main.async {
                guard let self = self, self.generation == current, self.completion != nil else { return }
                if let callback = callback, policy.acceptsCallback(callback) {
                    self.finish(.success(callback))
                } else if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    self.finish(.failure(.cancelled))
                } else { self.finish(.failure(.unavailable)) }
            }
        }
        session.presentationContextProvider = self
        // Corporate SSO remains under the system browser's cookie and consent controls.
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        guard session.start() else { finish(.failure(.unavailable)); return }
        let timeout = DispatchWorkItem { [weak self] in self?.cancel(.timeout) }
        self.timeout = timeout
        DispatchQueue.main.asyncAfter(deadline: .now() + 300, execute: timeout)
    }

    func cancel(_ reason: AuthBridgeError = .cancelled) {
        let previous = session
        finish(.failure(reason))
        previous?.cancel()
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        // start() requires the existing visible app window before constructing a session.
        return anchor ?? ASPresentationAnchor()
    }

    private func finish(_ result: Result<URL, AuthBridgeError>) {
        let callback = completion
        completion = nil
        session = nil
        anchor = nil
        timeout?.cancel()
        timeout = nil
        generation = UUID()
        callback?(result)
    }
}
