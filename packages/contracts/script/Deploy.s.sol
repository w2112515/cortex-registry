// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {CortexRegistry} from "../src/CortexRegistry.sol";

/**
 * @title DeployCortexRegistry
 * @notice Foundry deployment script for CortexRegistry contract
 * @dev Usage:
 *      forge script script/Deploy.s.sol:DeployCortexRegistry \
 *          --rpc-url $RPC_URL \
 *          --private-key $DEPLOYER_PRIVATE_KEY \
 *          --broadcast \
 *          --verify
 * 
 * Environment variables:
 *   RPC_URL - Cronos Testnet RPC endpoint
 *   DEPLOYER_PRIVATE_KEY - Deployer wallet private key
 *   ARBITRATOR_ADDRESS - Address authorized to resolve challenges
 *   TREASURY_ADDRESS - Address to receive protocol fees
 *   MIN_STAKE - Minimum stake in wei (default: 100 CRO = 100e18)
 */
contract DeployCortexRegistry is Script {
    // Default values for testnet
    uint256 constant DEFAULT_MIN_STAKE = 10 ether; // 10 CRO for testnet (lower for testing)

    function run() external {
        // Load environment variables
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address arbitrator = vm.envAddress("ARBITRATOR_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        
        // Optional: override min stake for testnet
        uint256 minStake = vm.envOr("MIN_STAKE", DEFAULT_MIN_STAKE);

        console.log("=== CortexRegistry Deployment ===");
        console.log("Deployer:", vm.addr(deployerPrivateKey));
        console.log("Arbitrator:", arbitrator);
        console.log("Treasury:", treasury);
        console.log("Min Stake:", minStake);

        // Start broadcast
        vm.startBroadcast(deployerPrivateKey);

        // Deploy CortexRegistry
        CortexRegistry registry = new CortexRegistry(
            minStake,
            arbitrator,
            treasury
        );

        vm.stopBroadcast();

        // Log deployment result
        console.log("=== Deployment Complete ===");
        console.log("CortexRegistry deployed at:", address(registry));
        console.log("");
        console.log("Next steps:");
        console.log("1. Set REGISTRY_ADDRESS=", address(registry));
        console.log("2. Verify contract on explorer");
        console.log("3. Run integration tests");
    }
}
