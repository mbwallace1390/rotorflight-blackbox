# Issues and Support.

Please remember the issue tracker on github is _not_ for user support.  Please also do not email developers directly for support.  Instead please use IRC or the forums first, then if the problem is confirmed create an issue that details how to repeat the problem so it can be investigated.

Issues created without steps to repeat are likely to be closed.  E-mail requests for support will go un-answered; All support needs to be public so that other people can read the problems and solutions.

Remember that issues that are due to mis-configuration, wiring or failure to read documentation just takes time away from the developers and can often be solved without developer interaction by other users.

Please search for existing issues *before* creating new ones.

# Developers

Please refer to the development section in the [this folder](https://github.com/betaflight/betaflight/tree/master/docs/development).

## Lightweight logic checks

Run `node test/run-node-tests.js` using the Node version in `.nvmrc`.
This runs the existing browser expo tests and focused variable-byte, signed-field,
bounded-stream, and curve-math checks against the actual JavaScript modules.
Reported failures from the old browser harness now exit with an error in CI.
No package installation or desktop app build is required for this check.

The separate **Blackbox decoder and math checks** workflow runs on pull requests
and pushes to `master` and `RF-*`, or manually. Existing platform builds and
release triggers are unchanged. These logic checks do not exercise NW.js UI,
device integration, or complete real-world flight-log playback.
Weekly grouped Actions dependency proposals require review and never auto-merge.
