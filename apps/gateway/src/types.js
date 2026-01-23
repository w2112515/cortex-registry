/**
 * Local Type Definitions for Gateway
 *
 * @description Types mirrored from SDK for Gateway internal use
 * @note These should eventually be imported from @cortex-registry/sdk
 */
// ============ Chain Types ============
/**
 * Service lifecycle states (mirrors Solidity enum)
 */
export var ServiceState;
(function (ServiceState) {
    ServiceState[ServiceState["Pending"] = 0] = "Pending";
    ServiceState[ServiceState["Active"] = 1] = "Active";
    ServiceState[ServiceState["Challenged"] = 2] = "Challenged";
    ServiceState[ServiceState["Slashed"] = 3] = "Slashed";
    ServiceState[ServiceState["Withdrawn"] = 4] = "Withdrawn";
})(ServiceState || (ServiceState = {}));
//# sourceMappingURL=types.js.map