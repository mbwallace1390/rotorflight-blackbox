"use strict";

/**
 * The viewer still contains a few NW.js startup hooks in main.js. Native web
 * containers such as Android WebView do not provide require("nw.gui"), so give
 * those startup hooks a deliberately small no-op implementation. Desktop NW.js
 * keeps using its real require function.
 */
(function installNwGuiFallback() {
    if (typeof window.require === "function") {
        return;
    }

    var app = {
        argv: [],
        on: function () {
            // File-association events are supplied by NW.js only.
        },
    };

    window.require = function (moduleName) {
        if (moduleName !== "nw.gui") {
            throw new Error("Unsupported desktop module: " + moduleName);
        }

        return {
            App: app,
            Window: {
                get: function () {
                    return {
                        on: function () {},
                    };
                },
                open: function () {
                    throw new Error("Secondary windows are unavailable on this platform");
                },
            },
            Shell: {
                openExternal: function (url) {
                    window.location.href = url;
                },
            },
        };
    };
})();

/**
 * A local key/value store for JSON-encodable values. Supports localStorage and chrome.storage.local backends.
 *
 * Supply keyPrefix if you want it automatically prepended to key names.
 */
function PrefStorage(keyPrefix) {
    var
        LOCALSTORAGE = 0,
        CHROME_STORAGE_LOCAL = 1,

        mode;

    /**
     * Fetch the value with the given name, calling the onGet handler (possibly asynchronously) with the retrieved
     * value, or null if the value didn't exist.
     */
    this.get = function(name, onGet) {
        name = keyPrefix + name;

        switch (mode) {
            case LOCALSTORAGE:
                var
                    parsed = null;

                try {
                    parsed = JSON.parse(window.localStorage[name]);
                } catch (e) {
                }

                onGet(parsed);
            break;
            case CHROME_STORAGE_LOCAL:
                chrome.storage.local.get(name, function(data) {
                    onGet(data[name]);
                });
            break;
        }
    };

    /**
     * Set the given JSON-encodable value into storage using the given name.
     */
    this.set = function(name, value) {
        name = keyPrefix + name;

        switch (mode) {
            case LOCALSTORAGE:
                window.localStorage[name] = JSON.stringify(value);
            break;
            case CHROME_STORAGE_LOCAL:
                var
                    data = {};

                data[name] = value;
                chrome.storage.local.set(data);
            break;
        }
    };

    if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
        mode = CHROME_STORAGE_LOCAL;
    } else {
        mode = LOCALSTORAGE;
    }

    keyPrefix = keyPrefix || "";
}
