import UIKit
import UniformTypeIdentifiers
import WebKit

private struct PendingBlackboxLog {
  let resourceURL: URL
  let displayName: String
}

private enum BlackboxImportError: LocalizedError {
  case unsupportedExtension
  case copyFailed

  var errorDescription: String? {
    switch self {
    case .unsupportedExtension:
      return "Choose a .bbl, .bfl, .cfl, .log, or .txt Blackbox log."
    case .copyFailed:
      return "The selected log could not be copied into the app cache."
    }
  }
}

final class RotorflightViewerController: UIViewController {
  static let blackboxTypeIdentifier = "io.github.mbwallace1390.rotorlens.blackbox-log"

  private let importDirectory: URL
  private let schemeHandler: BlackboxURLSchemeHandler
  private let importQueue = DispatchQueue(
    label: "io.github.mbwallace1390.rotorlens.ios.document-import",
    qos: .userInitiated
  )

  private var webView: WKWebView!
  private var pageReady = false
  private var pickerRequested: Bool
  private var isImporting = false
  private var queuedDocumentURL: URL?
  private var pendingLog: PendingBlackboxLog?
  private var lastDispatchedLog: PendingBlackboxLog?
  private var dispatchAttempt = 0

  init(resourceRoot: URL, importDirectory: URL, pickImmediately: Bool) {
    self.importDirectory = importDirectory
    schemeHandler = BlackboxURLSchemeHandler(
      resourceRoot: resourceRoot,
      importRoot: importDirectory
    )
    pickerRequested = pickImmediately
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func loadView() {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    configuration.allowsInlineMediaPlayback = true
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = false
    configuration.defaultWebpagePreferences.allowsContentJavaScript = true
    configuration.applicationNameForUserAgent = Self.userAgentSuffix
    configuration.setURLSchemeHandler(
      schemeHandler,
      forURLScheme: BlackboxURLSchemeHandler.scheme
    )

    webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.scrollView.contentInsetAdjustmentBehavior = .automatic

#if DEBUG
    if #available(iOS 16.4, *) {
      webView.isInspectable = true
    }
#endif

    view = webView
  }

  override func viewDidLoad() {
    super.viewDidLoad()

    title = "Blackbox Viewer"
    navigationItem.leftBarButtonItem = UIBarButtonItem(
      barButtonSystemItem: .close,
      target: self,
      action: #selector(closeViewer)
    )
    navigationItem.rightBarButtonItem = UIBarButtonItem(
      title: "Open Log",
      style: .plain,
      target: self,
      action: #selector(requestDocumentPicker)
    )

    var startURL = URLComponents()
    startURL.scheme = BlackboxURLSchemeHandler.scheme
    startURL.host = BlackboxURLSchemeHandler.host
    startURL.path = "/index.html"

    if let url = startURL.url {
      webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
    } else {
      showError("The local Blackbox viewer URL is invalid.")
    }
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    presentDocumentPickerIfRequested()
  }

  func importDocument(at sourceURL: URL) {
    guard BlackboxFileSupport.isSupported(sourceURL) else {
      showError(BlackboxImportError.unsupportedExtension.localizedDescription)
      return
    }

    guard !isImporting else {
      // External Open In requests can arrive while a provider copy is active.
      // Keep the latest request so it is never silently accepted and dropped.
      queuedDocumentURL = sourceURL
      return
    }

    isImporting = true
    navigationItem.rightBarButtonItem?.isEnabled = false
    navigationItem.prompt = "Importing \(sourceURL.lastPathComponent)…"

    let destinationRoot = importDirectory
    importQueue.async { [weak self] in
      let result = Result {
        try Self.copyCoordinatedDocument(
          at: sourceURL,
          into: destinationRoot
        )
      }

      DispatchQueue.main.async {
        guard let self else {
          return
        }

        switch result {
        case .success(let imported):
          let resourceURL = self.schemeHandler.installCachedLog(fileURL: imported.fileURL)
          // The import copy and scheme handler both replace the previous cached
          // resource, so its recovery URL is no longer valid after this point.
          self.lastDispatchedLog = nil
          self.pendingLog = PendingBlackboxLog(
            resourceURL: resourceURL,
            displayName: imported.displayName
          )
          self.dispatchAttempt = 0
          self.navigationItem.prompt = "Opening \(imported.displayName)…"
          self.dispatchPendingLogIfReady()
        case .failure(let error):
          self.finishCurrentImport()
          self.showError(error.localizedDescription)
        }
      }
    }
  }

  func requestDocumentPickerWhenReady() {
    pickerRequested = true
    presentDocumentPickerIfRequested()
  }

  @objc private func closeViewer() {
    navigationController?.dismiss(animated: true)
  }

  @objc private func requestDocumentPicker() {
    pickerRequested = true
    presentDocumentPickerIfRequested()
  }

  private func presentDocumentPickerIfRequested() {
    guard pickerRequested,
          !isImporting,
          viewIfLoaded?.window != nil,
          presentedViewController == nil else {
      return
    }

    pickerRequested = false

    let blackboxType = UTType(exportedAs: Self.blackboxTypeIdentifier)
    let picker = UIDocumentPickerViewController(
      forOpeningContentTypes: [blackboxType, .plainText],
      asCopy: false
    )
    picker.delegate = self
    picker.allowsMultipleSelection = false
    picker.shouldShowFileExtensions = true
    present(picker, animated: true)
  }

  private func dispatchPendingLogIfReady() {
    guard pageReady, let pendingLog else {
      return
    }

    let script = """
      if (typeof window.openRotorflightSharedFile !== 'function') {
        return "unavailable";
      }
      const opened = await window.openRotorflightSharedFile(resourceURL, displayName);
      return opened === true ? "opened" : "superseded";
      """

    webView.callAsyncJavaScript(
      script,
      arguments: [
        "resourceURL": pendingLog.resourceURL.absoluteString,
        "displayName": pendingLog.displayName,
      ],
      in: nil,
      in: .page
    ) { [weak self] result in
      guard let self,
            self.pendingLog?.resourceURL == pendingLog.resourceURL else {
        return
      }

      switch result {
      case .success(let value) where (value as? String) == "opened":
        self.lastDispatchedLog = pendingLog
        self.pendingLog = nil
        self.dispatchAttempt = 0
        self.finishCurrentImport()
      case .success(let value) where (value as? String) == "superseded":
        // A newer in-page selection won the shared generation race. Do not
        // retry this stale native import and overwrite the user's newer log.
        self.pendingLog = nil
        self.dispatchAttempt = 0
        self.finishCurrentImport()
      case .success:
        self.retryPendingLogDispatch()
      case .failure(let error):
        // WebKit termination triggers a reload and retries the still-pending
        // token from didFinish. Do not turn that recovery into a user error.
        guard self.pageReady else {
          return
        }
        self.pendingLog = nil
        self.dispatchAttempt = 0
        self.finishCurrentImport()
        self.showError("The selected Blackbox log could not be opened: \(error.localizedDescription)")
      }
    }
  }

  private func retryPendingLogDispatch() {
    dispatchAttempt += 1
    guard dispatchAttempt < 100 else {
      pendingLog = nil
      dispatchAttempt = 0
      finishCurrentImport()
      showError("The Blackbox parser did not become ready in time.")
      return
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
      self?.dispatchPendingLogIfReady()
    }
  }

  private func finishCurrentImport() {
    isImporting = false
    navigationItem.rightBarButtonItem?.isEnabled = true
    navigationItem.prompt = nil

    guard let queuedDocumentURL else {
      return
    }

    self.queuedDocumentURL = nil
    importDocument(at: queuedDocumentURL)
  }

  private func showError(_ message: String) {
    guard viewIfLoaded?.window != nil else {
      return
    }

    let alert = UIAlertController(
      title: "Unable to Open Log",
      message: message,
      preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "OK", style: .default))
    present(alert, animated: true)
  }

  private static var userAgentSuffix: String {
    let version = Bundle.main.object(
      forInfoDictionaryKey: "CFBundleShortVersionString"
    ) as? String ?? "0"
    return "RotorflightBlackboxIOS/\(version)"
  }

  nonisolated private static func copyCoordinatedDocument(
    at sourceURL: URL,
    into importDirectory: URL
  ) throws -> (fileURL: URL, displayName: String) {
    guard BlackboxFileSupport.isSupported(sourceURL) else {
      throw BlackboxImportError.unsupportedExtension
    }

    let fileManager = FileManager.default
    try fileManager.createDirectory(
      at: importDirectory,
      withIntermediateDirectories: true
    )

    let displayName = sourceURL.lastPathComponent.isEmpty
      ? "BLACKBOX_LOG.\(sourceURL.pathExtension.uppercased())"
      : sourceURL.lastPathComponent
    let fileExtension = sourceURL.pathExtension.lowercased()
    let destination = importDirectory
      .appendingPathComponent(UUID().uuidString.lowercased(), isDirectory: false)
      .appendingPathExtension(fileExtension)
    let partial = importDirectory
      .appendingPathComponent(".partial-\(UUID().uuidString.lowercased())")

    let hasSecurityScope = sourceURL.startAccessingSecurityScopedResource()
    defer {
      if hasSecurityScope {
        sourceURL.stopAccessingSecurityScopedResource()
      }
      try? fileManager.removeItem(at: partial)
    }

    var coordinationError: NSError?
    var copyError: Error?
    let coordinator = NSFileCoordinator(filePresenter: nil)
    coordinator.coordinate(
      readingItemAt: sourceURL,
      options: [],
      error: &coordinationError
    ) { coordinatedURL in
      do {
        try fileManager.copyItem(at: coordinatedURL, to: partial)
        try fileManager.moveItem(at: partial, to: destination)
      } catch {
        copyError = error
      }
    }

    if let copyError {
      throw copyError
    }
    if let coordinationError {
      throw coordinationError
    }
    guard fileManager.fileExists(atPath: destination.path) else {
      throw BlackboxImportError.copyFailed
    }

    do {
      let cachedItems = try fileManager.contentsOfDirectory(
        at: importDirectory,
        includingPropertiesForKeys: nil,
        options: []
      )
      for cachedItem in cachedItems where cachedItem != destination {
        try fileManager.removeItem(at: cachedItem)
      }
    } catch {
      try? fileManager.removeItem(at: destination)
      throw error
    }

    return (destination, displayName)
  }
}

extension RotorflightViewerController: UIDocumentPickerDelegate {
  func documentPicker(
    _ controller: UIDocumentPickerViewController,
    didPickDocumentsAt urls: [URL]
  ) {
    guard let selectedURL = urls.first else {
      return
    }
    importDocument(at: selectedURL)
  }
}

extension RotorflightViewerController: WKNavigationDelegate {
  func webView(
    _ webView: WKWebView,
    decidePolicyFor navigationAction: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    guard let url = navigationAction.request.url,
          let scheme = url.scheme?.lowercased() else {
      decisionHandler(.cancel)
      return
    }

    if scheme == BlackboxURLSchemeHandler.scheme,
       url.host?.lowercased() == BlackboxURLSchemeHandler.host {
      decisionHandler(.allow)
      return
    }

    if Self.externalSchemes.contains(scheme) {
      UIApplication.shared.open(url, options: [:])
    }
    decisionHandler(.cancel)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard webView.url?.scheme?.lowercased() == BlackboxURLSchemeHandler.scheme,
          webView.url?.host?.lowercased() == BlackboxURLSchemeHandler.host else {
      return
    }

    pageReady = true
    dispatchPendingLogIfReady()
  }

  func webView(
    _ webView: WKWebView,
    didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    pageReady = false
    showError("The bundled Blackbox viewer could not be loaded: \(error.localizedDescription)")
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    pageReady = false
    if pendingLog == nil {
      pendingLog = lastDispatchedLog
    }
    webView.reload()
  }

  private static let externalSchemes: Set<String> = ["http", "https", "mailto"]
}

extension RotorflightViewerController: WKUIDelegate {
  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url,
       let scheme = url.scheme?.lowercased(),
       Self.externalSchemes.contains(scheme) {
      UIApplication.shared.open(url, options: [:])
    }
    return nil
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptAlertPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    let alert = UIAlertController(title: "Blackbox Viewer", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
      completionHandler()
    })
    present(alert, animated: true)
  }

  func webView(
    _ webView: WKWebView,
    runJavaScriptConfirmPanelWithMessage message: String,
    initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let alert = UIAlertController(title: "Blackbox Viewer", message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in
      completionHandler(false)
    })
    alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in
      completionHandler(true)
    })
    present(alert, animated: true)
  }
}
