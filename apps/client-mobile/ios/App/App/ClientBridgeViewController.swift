import Capacitor

final class ClientBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ElvoranceAuthBridgePlugin())
    }
}
