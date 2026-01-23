// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title AntiSybil
 * @notice Library for anti-Sybil attack mechanisms via progressive staking
 * @dev Implements progressive stake requirements to deter Sybil attacks
 * 
 * Core mechanism: Each additional service registered by the same provider
 * requires incrementally higher stake, making mass registration economically
 * prohibitive.
 * 
 * Formula: requiredStake = baseStake * (100 + (count * incrementRatio)) / 100
 * 
 * @custom:source TAP-2 Staking Game Theory Whitepaper §Part 5
 * @custom:ref docs/arsenal/staking_game_whitepaper.md
 */
library AntiSybil {
    // ============ Constants ============

    /// @notice Default increment ratio per additional service (10%)
    uint256 public constant DEFAULT_INCREMENT_RATIO = 10;

    /// @notice Maximum services per provider (anti-spam)
    uint256 public constant MAX_SERVICES_PER_PROVIDER = 100;

    // ============ Errors ============

    /// @notice Thrown when provider exceeds maximum service limit
    error MaxServicesExceeded(address provider, uint256 current, uint256 max);

    // ============ Core Functions ============

    /**
     * @notice Calculate stake requirement for the Nth service
     * @dev Linear increment formula prevents exponential overflow
     *      Formula: baseStake * (100 + (existingCount * incrementRatio)) / 100
     *      
     *      Examples with baseStake=100, incrementRatio=10:
     *      - 1st service (count=0): 100 * (100 + 0) / 100 = 100
     *      - 2nd service (count=1): 100 * (100 + 10) / 100 = 110
     *      - 3rd service (count=2): 100 * (100 + 20) / 100 = 120
     *      - 10th service (count=9): 100 * (100 + 90) / 100 = 190
     *      
     * @param baseStake Minimum stake for first service (MIN_STAKE)
     * @param existingCount Number of services already registered by provider
     * @param incrementRatio Percentage increase per service (e.g., 10 = 10%)
     * @return requiredStake Stake required for the next service
     */
    function calculateStakeRequirement(
        uint256 baseStake,
        uint256 existingCount,
        uint256 incrementRatio
    ) internal pure returns (uint256 requiredStake) {
        // Multiplier = 100 + (count * incrementRatio)
        uint256 multiplier = 100 + (existingCount * incrementRatio);
        
        // requiredStake = baseStake * multiplier / 100
        requiredStake = (baseStake * multiplier) / 100;
        
        return requiredStake;
    }

    /**
     * @notice Calculate stake requirement with default increment ratio
     * @param baseStake Minimum stake for first service
     * @param existingCount Number of existing services
     * @return requiredStake Required stake for next service
     */
    function calculateStakeRequirementDefault(
        uint256 baseStake,
        uint256 existingCount
    ) internal pure returns (uint256 requiredStake) {
        return calculateStakeRequirement(baseStake, existingCount, DEFAULT_INCREMENT_RATIO);
    }

    /**
     * @notice Calculate total stake needed for N services
     * @dev Useful for cost analysis: sum of arithmetic series
     *      Sum = n * baseStake + baseStake * incrementRatio * (0+1+2+...+(n-1)) / 100
     *      Sum = n * baseStake + baseStake * incrementRatio * n*(n-1)/2 / 100
     *      
     * @param baseStake Minimum stake per service
     * @param serviceCount Number of services to register
     * @param incrementRatio Percentage increase per service
     * @return totalStake Total stake needed for all services
     */
    function calculateTotalStakeForServices(
        uint256 baseStake,
        uint256 serviceCount,
        uint256 incrementRatio
    ) internal pure returns (uint256 totalStake) {
        if (serviceCount == 0) return 0;
        
        // Base stake contribution: n * baseStake
        uint256 baseContribution = serviceCount * baseStake;
        
        // Increment contribution: baseStake * incrementRatio * sum(0..n-1) / 100
        // sum(0..n-1) = n * (n-1) / 2
        uint256 sumOfIndices = (serviceCount * (serviceCount - 1)) / 2;
        uint256 incrementContribution = (baseStake * incrementRatio * sumOfIndices) / 100;
        
        totalStake = baseContribution + incrementContribution;
        
        return totalStake;
    }

    /**
     * @notice Check if provider can register another service
     * @param existingCount Current number of services by provider
     * @return canRegister True if under the limit
     */
    function canRegisterService(uint256 existingCount) internal pure returns (bool canRegister) {
        return existingCount < MAX_SERVICES_PER_PROVIDER;
    }

    /**
     * @notice Validate and calculate stake for new registration
     * @dev Combines limit check with stake calculation
     * @param baseStake Minimum stake for first service
     * @param existingCount Current service count
     * @param incrementRatio Percentage increase per service
     * @param provider Provider address (for error reporting)
     * @return requiredStake Stake required for registration
     */
    function validateAndCalculateStake(
        uint256 baseStake,
        uint256 existingCount,
        uint256 incrementRatio,
        address provider
    ) internal pure returns (uint256 requiredStake) {
        // Check limit
        if (existingCount >= MAX_SERVICES_PER_PROVIDER) {
            revert MaxServicesExceeded(provider, existingCount, MAX_SERVICES_PER_PROVIDER);
        }
        
        // Calculate stake
        return calculateStakeRequirement(baseStake, existingCount, incrementRatio);
    }

    // ============ Attack Cost Analysis ============

    /**
     * @notice Calculate cost to perform Sybil attack with N services
     * @dev Attacker must stake progressively more for each service
     *      This makes large-scale Sybil attacks economically prohibitive
     *      
     * @param baseStake Base stake per service
     * @param attackerServices Number of malicious services
     * @param slashRatio Percentage slashed if caught (e.g., 30)
     * @param detectionProbability Probability of being caught (1e18 fixed-point)
     * @return expectedLoss Expected loss from attack
     */
    function calculateSybilAttackCost(
        uint256 baseStake,
        uint256 attackerServices,
        uint256 slashRatio,
        uint256 detectionProbability
    ) internal pure returns (uint256 expectedLoss) {
        uint256 totalStake = calculateTotalStakeForServices(
            baseStake, 
            attackerServices, 
            DEFAULT_INCREMENT_RATIO
        );
        
        // Expected slash = totalStake * slashRatio * detectionProbability / (100 * 1e18)
        expectedLoss = (totalStake * slashRatio * detectionProbability) / (100 * 1e18);
        
        return expectedLoss;
    }
}
