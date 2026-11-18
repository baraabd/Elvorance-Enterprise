import Capacitor

final class RepBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ElvoranceAuthBridgePlugin())
    }
}
