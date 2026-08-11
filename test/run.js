"use strict";

(async function main() {
    require("./parser_smoke");
    await require("./mobile_compatibility_smoke");
    await require("./advisor_metrics");
    await require("./advisor_mechanical");
    await require("./advisor_ai_contract");
    await require("./advisor_cyclic_pid");
}()).catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
