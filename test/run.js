"use strict";

(async function main() {
    require("./parser_smoke");
    await require("./mobile_compatibility_smoke");
    await require("./advisor_metrics");
    await require("./advisor_mechanical");
}()).catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
