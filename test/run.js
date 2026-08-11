"use strict";

(async function main() {
    require("./parser_smoke");
    await require("./mobile_compatibility_smoke");
    await require("./advisor_metrics");
    await require("./advisor_mechanical");
    await require("./advisor_ai_contract");
}()).catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
