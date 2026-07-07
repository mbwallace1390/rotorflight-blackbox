'use strict';

function localize() {
    var localized = 0;
    var i18n = window.chrome && window.chrome.i18n;

    var translate = function(messageID) {
        if (!i18n || typeof i18n.getMessage !== 'function') {
            return null;
        }

        var message = i18n.getMessage(messageID);
        if (message) {
            localized++;
            return message;
        }

        return null;
    };

    $('[i18n]:not(.i18n-replaced)').each(function() {
        var element = $(this);
        var message = translate(element.attr('i18n'));

        // The source HTML already contains English labels. Keep that text when
        // Chrome/NW.js localization APIs are unavailable, such as Android WebView.
        if (message !== null) {
            element.html(message);
        }
        element.addClass('i18n-replaced');
    });

    $('[i18n_title]:not(.i18n_title-replaced)').each(function() {
        var element = $(this);
        var message = translate(element.attr('i18n_title'));

        if (message !== null) {
            element.attr('title', message);
        }
        element.addClass('i18n_title-replaced');
    });

    $('[i18n_value]:not(.i18n_value-replaced)').each(function() {
        var element = $(this);
        var message = translate(element.attr('i18n_value'));

        if (message !== null) {
            element.val(message);
        }
        element.addClass('i18n_value-replaced');
    });

    $('[i18n_placeholder]:not(.i18n_placeholder-replaced)').each(function() {
        var element = $(this);
        var message = translate(element.attr('i18n_placeholder'));

        if (message !== null) {
            element.attr('placeholder', message);
        }
        element.addClass('i18n_placeholder-replaced');
    });

    return localized;
}
