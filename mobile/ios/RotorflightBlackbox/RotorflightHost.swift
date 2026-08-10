import React
import UIKit

@objc(RotorflightHost)
final class RotorflightHost: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(openViewer:resolver:rejecter:)
  func openViewer(
    _ pickImmediately: Bool,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter _: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      RotorflightViewerCoordinator.shared.presentViewer(
        pickImmediately: pickImmediately,
        completion: { opened in resolve(opened) }
      )
    }
  }
}

@MainActor
final class RotorflightViewerCoordinator {
  static let shared = RotorflightViewerCoordinator()

  private weak var activeViewer: RotorflightViewerController?
  private weak var activeNavigationController: UINavigationController?

  private init() {}

  func presentViewer(
    pickImmediately: Bool,
    completion: @escaping (Bool) -> Void
  ) {
    dispatchPrecondition(condition: .onQueue(.main))

    if let activeViewer,
       let navigationController = activeNavigationController,
       navigationController.presentingViewController != nil {
      if pickImmediately {
        activeViewer.requestDocumentPickerWhenReady()
      }
      completion(true)
      return
    }

    guard let paths = viewerPaths(),
          let presenter = Self.presentationController() else {
      completion(false)
      return
    }

    let viewer = RotorflightViewerController(
      resourceRoot: paths.resourceRoot,
      importDirectory: paths.importDirectory,
      pickImmediately: pickImmediately
    )
    let navigationController = UINavigationController(rootViewController: viewer)
    navigationController.modalPresentationStyle = .fullScreen
    navigationController.navigationBar.prefersLargeTitles = false

    activeViewer = viewer
    activeNavigationController = navigationController

    presenter.present(navigationController, animated: true) {
      completion(true)
    }
  }

  @discardableResult
  func openExternalDocument(_ url: URL) -> Bool {
    guard BlackboxFileSupport.isSupported(url) else {
      return false
    }

    presentViewer(pickImmediately: false) { opened in
      guard opened else {
        return
      }
      self.activeViewer?.importDocument(at: url)
    }
    return true
  }

  private func viewerPaths() -> (resourceRoot: URL, importDirectory: URL)? {
    let fileManager = FileManager.default
    guard let bundleResources = Bundle.main.resourceURL,
          let caches = fileManager.urls(
            for: .cachesDirectory,
            in: .userDomainMask
          ).first else {
      return nil
    }

    let resourceRoot = bundleResources
      .appendingPathComponent("BlackboxWeb", isDirectory: true)
      .standardizedFileURL
    let indexURL = resourceRoot.appendingPathComponent("index.html")
    var isDirectory = ObjCBool(false)
    guard fileManager.fileExists(atPath: resourceRoot.path, isDirectory: &isDirectory),
          isDirectory.boolValue,
          fileManager.fileExists(atPath: indexURL.path) else {
      return nil
    }

    let importDirectory = caches
      .appendingPathComponent("ImportedLogs", isDirectory: true)
      .standardizedFileURL
    do {
      try fileManager.createDirectory(
        at: importDirectory,
        withIntermediateDirectories: true
      )
      Self.removeInterruptedImports(in: importDirectory)
    } catch {
      return nil
    }

    return (resourceRoot, importDirectory)
  }

  private static func removeInterruptedImports(in directory: URL) {
    guard let items = try? FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil,
      options: []
    ) else {
      return
    }

    for item in items where item.lastPathComponent.hasPrefix(".partial-") {
      try? FileManager.default.removeItem(at: item)
    }
  }

  private static func presentationController() -> UIViewController? {
    let activeScenes = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }

    for scene in activeScenes {
      let window = scene.windows.first(where: \.isKeyWindow) ?? scene.windows.first
      if let rootViewController = window?.rootViewController {
        return topViewController(from: rootViewController)
      }
    }

    let appWindow = (UIApplication.shared.delegate as? AppDelegate)?.window
    if let rootViewController = appWindow?.rootViewController {
      return topViewController(from: rootViewController)
    }

    return nil
  }

  private static func topViewController(from controller: UIViewController) -> UIViewController {
    if let presented = controller.presentedViewController {
      return topViewController(from: presented)
    }
    if let navigation = controller as? UINavigationController,
       let visible = navigation.visibleViewController {
      return topViewController(from: visible)
    }
    if let tab = controller as? UITabBarController,
       let selected = tab.selectedViewController {
      return topViewController(from: selected)
    }
    return controller
  }
}
