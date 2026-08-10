import Foundation
import WebKit

enum BlackboxFileSupport {
  static let allowedExtensions: Set<String> = ["bbl", "bfl", "cfl", "log", "txt"]

  static func isSupported(_ url: URL) -> Bool {
    allowedExtensions.contains(url.pathExtension.lowercased())
  }

  static func mimeType(for url: URL) -> String {
    mimeTypes[url.pathExtension.lowercased()] ?? "application/octet-stream"
  }

  private static let mimeTypes: [String: String] = [
    "bbl": "application/x-blackbox-log",
    "bfl": "application/x-blackbox-log",
    "bin": "application/octet-stream",
    "cfl": "application/x-blackbox-log",
    "css": "text/css; charset=utf-8",
    "eot": "application/vnd.ms-fontobject",
    "gif": "image/gif",
    "glb": "model/gltf-binary",
    "gltf": "model/gltf+json",
    "html": "text/html; charset=utf-8",
    "ico": "image/x-icon",
    "icns": "image/x-icns",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "js": "application/javascript; charset=utf-8",
    "json": "application/json; charset=utf-8",
    "log": "text/plain; charset=utf-8",
    "map": "application/json; charset=utf-8",
    "mp4": "video/mp4",
    "png": "image/png",
    "svg": "image/svg+xml",
    "ttf": "font/ttf",
    "txt": "text/plain; charset=utf-8",
    "wasm": "application/wasm",
    "webm": "video/webm",
    "webp": "image/webp",
    "woff": "font/woff",
    "woff2": "font/woff2",
    "xml": "application/xml; charset=utf-8",
  ]
}

private struct CachedBlackboxLog {
  let fileURL: URL
  let token: String
  let mimeType: String
}

private enum BlackboxSchemeError: LocalizedError {
  case invalidRequest
  case resourceNotFound
  case accessDenied

  var errorDescription: String? {
    switch self {
    case .invalidRequest:
      return "The Blackbox resource request is invalid."
    case .resourceNotFound:
      return "The Blackbox resource was not found."
    case .accessDenied:
      return "The Blackbox resource request was blocked."
    }
  }
}

final class BlackboxURLSchemeHandler: NSObject {
  static let scheme = "rotorlens-local"
  static let host = "app"

  private let resourceRoot: URL
  private let importRoot: URL
  private let workQueue = DispatchQueue(
    label: "io.github.mbwallace1390.rotorlens.ios.scheme-handler",
    qos: .userInitiated
  )
  private let cachedLogLock = NSLock()
  private var cachedLog: CachedBlackboxLog?
  // WKURLSchemeHandler callbacks and stop notifications are totally ordered
  // on the main queue. WebKit forbids any progress callback after stop().
  private var stoppedTasks = Set<ObjectIdentifier>()

  init(resourceRoot: URL, importRoot: URL) {
    self.resourceRoot = resourceRoot.standardizedFileURL.resolvingSymlinksInPath()
    self.importRoot = importRoot.standardizedFileURL.resolvingSymlinksInPath()
    super.init()
  }

  func installCachedLog(fileURL: URL) -> URL {
    let token = UUID().uuidString.lowercased()
    let cached = CachedBlackboxLog(
      fileURL: fileURL,
      token: token,
      mimeType: BlackboxFileSupport.mimeType(for: fileURL)
    )

    cachedLogLock.lock()
    cachedLog = cached
    cachedLogLock.unlock()

    var components = URLComponents()
    components.scheme = Self.scheme
    components.host = Self.host
    components.path = "/shared/\(token)"
    return components.url!
  }

  private func resolveResource(for request: URLRequest) throws -> (
    url: URL,
    mimeType: String,
    cacheControl: String
  ) {
    guard request.httpMethod == nil
            || request.httpMethod == "GET"
            || request.httpMethod == "HEAD",
          let url = request.url,
          url.scheme?.lowercased() == Self.scheme,
          url.host?.lowercased() == Self.host,
          url.user == nil,
          url.password == nil,
          url.port == nil else {
      throw BlackboxSchemeError.invalidRequest
    }

    let pathComponents = try safePathComponents(from: url)

    if pathComponents.first == "shared" {
      return try resolveSharedLog(pathComponents: pathComponents)
    }

    let staticComponents = pathComponents.isEmpty ? ["index.html"] : pathComponents
    let resourceURL = try confinedFile(
      components: staticComponents,
      root: resourceRoot,
      allowedExtensions: nil
    )

    return (
      url: resourceURL,
      mimeType: BlackboxFileSupport.mimeType(for: resourceURL),
      cacheControl: "no-cache"
    )
  }

  private func resolveSharedLog(pathComponents: [String]) throws -> (
    url: URL,
    mimeType: String,
    cacheControl: String
  ) {
    guard pathComponents.count == 2 else {
      throw BlackboxSchemeError.accessDenied
    }

    cachedLogLock.lock()
    let currentLog = cachedLog
    cachedLogLock.unlock()

    guard let currentLog, currentLog.token == pathComponents[1] else {
      throw BlackboxSchemeError.resourceNotFound
    }

    let fileURL = try confinedFile(
      components: [currentLog.fileURL.lastPathComponent],
      root: importRoot,
      allowedExtensions: BlackboxFileSupport.allowedExtensions
    )

    guard fileURL == currentLog.fileURL.standardizedFileURL.resolvingSymlinksInPath() else {
      throw BlackboxSchemeError.accessDenied
    }

    return (
      url: fileURL,
      mimeType: currentLog.mimeType,
      cacheControl: "no-store"
    )
  }

  private func safePathComponents(from url: URL) throws -> [String] {
    guard let urlComponents = URLComponents(
      url: url,
      resolvingAgainstBaseURL: false
    ) else {
      throw BlackboxSchemeError.invalidRequest
    }

    let encodedPath = urlComponents.percentEncodedPath
    guard encodedPath.first == "/",
          let decodedPath = encodedPath.removingPercentEncoding,
          !decodedPath.contains("\\"),
          !decodedPath.contains("\0") else {
      throw BlackboxSchemeError.accessDenied
    }

    if decodedPath == "/" {
      return []
    }

    let components = decodedPath
      .dropFirst()
      .split(separator: "/", omittingEmptySubsequences: false)
      .map(String.init)

    guard !components.isEmpty,
          components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
      throw BlackboxSchemeError.accessDenied
    }

    return components
  }

  private func confinedFile(
    components: [String],
    root: URL,
    allowedExtensions: Set<String>?
  ) throws -> URL {
    var candidate = root
    for component in components {
      candidate.appendPathComponent(component, isDirectory: false)
    }

    candidate = candidate.standardizedFileURL.resolvingSymlinksInPath()
    let rootPath = root.path.hasSuffix("/") ? root.path : root.path + "/"

    guard candidate.path.hasPrefix(rootPath) else {
      throw BlackboxSchemeError.accessDenied
    }

    if let allowedExtensions,
       !allowedExtensions.contains(candidate.pathExtension.lowercased()) {
      throw BlackboxSchemeError.accessDenied
    }

    var isDirectory = ObjCBool(false)
    guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory),
          !isDirectory.boolValue else {
      throw BlackboxSchemeError.resourceNotFound
    }

    return candidate
  }

  private func sendFile(
    fileURL: URL,
    mimeType: String,
    cacheControl: String,
    identifier: ObjectIdentifier,
    to task: WKURLSchemeTask
  ) throws {
    let resourceValues = try fileURL.resourceValues(forKeys: [.fileSizeKey])
    guard let fileSize = resourceValues.fileSize else {
      throw BlackboxSchemeError.resourceNotFound
    }

    guard let url = task.request.url,
          let response = HTTPURLResponse(
            url: url,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
              "Cache-Control": cacheControl,
              "Content-Length": String(fileSize),
              "Content-Type": mimeType,
              "X-Content-Type-Options": "nosniff",
            ]
          ) else {
      throw BlackboxSchemeError.invalidRequest
    }

    guard performTaskCallback(identifier, callback: {
      task.didReceive(response)
    }) else {
      return
    }

    if task.request.httpMethod != "HEAD" {
      let fileHandle = try FileHandle(forReadingFrom: fileURL)
      defer { try? fileHandle.close() }

      while true {
        guard let chunk = try fileHandle.read(upToCount: 512 * 1024),
              !chunk.isEmpty else {
          break
        }

        guard performTaskCallback(identifier, callback: {
          task.didReceive(chunk)
        }) else {
          return
        }
      }
    }

    _ = performTaskCallback(identifier) {
      task.didFinish()
    }
  }

  private func sendData(
    data: Data,
    mimeType: String,
    cacheControl: String,
    statusCode: Int,
    identifier: ObjectIdentifier,
    to task: WKURLSchemeTask
  ) throws {
    guard let url = task.request.url,
          let response = HTTPURLResponse(
            url: url,
            statusCode: statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: [
              "Cache-Control": cacheControl,
              "Content-Length": String(data.count),
              "Content-Type": mimeType,
              "X-Content-Type-Options": "nosniff",
            ]
          ) else {
      throw BlackboxSchemeError.invalidRequest
    }

    guard performTaskCallback(identifier, callback: {
      task.didReceive(response)
    }) else {
      return
    }

    if task.request.httpMethod != "HEAD" {
      guard performTaskCallback(identifier, callback: {
        task.didReceive(data)
      }) else {
        return
      }
    }
    _ = performTaskCallback(identifier) {
      task.didFinish()
    }
  }

  private func sendError(
    statusCode: Int,
    message: String,
    identifier: ObjectIdentifier,
    to task: WKURLSchemeTask
  ) {
    do {
      try sendData(
        data: Data(message.utf8),
        mimeType: "text/plain; charset=utf-8",
        cacheControl: "no-store",
        statusCode: statusCode,
        identifier: identifier,
        to: task
      )
    } catch {
      _ = performTaskCallback(identifier) {
        task.didFailWithError(error)
      }
    }
  }

  @discardableResult
  private func performTaskCallback(
    _ identifier: ObjectIdentifier,
    callback: () -> Void
  ) -> Bool {
    let performOnMain = {
      guard !self.stoppedTasks.contains(identifier) else {
        return false
      }

      callback()
      return !self.stoppedTasks.contains(identifier)
    }

    if Thread.isMainThread {
      return performOnMain()
    }
    return DispatchQueue.main.sync(execute: performOnMain)
  }

  private func finishTracking(_ identifier: ObjectIdentifier) {
    let finishOnMain = {
      self.stoppedTasks.remove(identifier)
    }

    if Thread.isMainThread {
      finishOnMain()
    } else {
      DispatchQueue.main.sync(execute: finishOnMain)
    }
  }
}

@MainActor
extension BlackboxURLSchemeHandler: WKURLSchemeHandler {
  func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
    let identifier = ObjectIdentifier(urlSchemeTask as AnyObject)

    stoppedTasks.remove(identifier)

    workQueue.async { [weak self] in
      guard let self else {
        return
      }

      do {
        let resource = try self.resolveResource(for: urlSchemeTask.request)
        try self.sendFile(
          fileURL: resource.url,
          mimeType: resource.mimeType,
          cacheControl: resource.cacheControl,
          identifier: identifier,
          to: urlSchemeTask
        )
      } catch BlackboxSchemeError.accessDenied {
        self.sendError(
          statusCode: 403,
          message: "Blocked",
          identifier: identifier,
          to: urlSchemeTask
        )
      } catch BlackboxSchemeError.resourceNotFound {
        self.sendError(
          statusCode: 404,
          message: "Not found",
          identifier: identifier,
          to: urlSchemeTask
        )
      } catch {
        guard self.performTaskCallback(identifier, callback: {
          urlSchemeTask.didFailWithError(error)
        }) else {
          self.finishTracking(identifier)
          return
        }
      }

      self.finishTracking(identifier)
    }
  }

  func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
    stoppedTasks.insert(ObjectIdentifier(urlSchemeTask as AnyObject))
  }
}
