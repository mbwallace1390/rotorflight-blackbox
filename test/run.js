"use strict";

(async function main() {
    require("./parser_smoke");
    require("./mobile_compatibility_smoke");
    await require("./advisor_metrics");
}()).catch(function(error) {
    console.error(error);
    process.exitCode = 1;
});
