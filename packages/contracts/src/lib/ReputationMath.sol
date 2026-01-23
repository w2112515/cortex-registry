// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title ReputationMath
 * @notice Pure math library for Bayesian reputation scoring
 * @dev Implements TAP-1 贝叶斯加权评分模型
 * 
 * Core formula: BayesianScore = (n * avg + C * m) / (n + C)
 * 
 * Where:
 * - n: total number of calls/ratings
 * - avg: average success rate (successCount / totalCalls)
 * - C: confidence constant (prior strength)
 * - m: prior mean (expected default score)
 * 
 * All calculations use 1e18 fixed-point precision for [0, 1] range.
 * 
 * @custom:source TAP-1 Bayesian Reputation Whitepaper
 * @custom:ref docs/arsenal/bayesian_reputation_whitepaper.md
 */
library ReputationMath {
    // ============ Constants ============

    /// @notice Fixed-point precision (18 decimals)
    uint256 public constant PRECISION = 1e18;

    /// @notice Default confidence constant
    /// @dev Higher C = more conservative scoring for new services
    /// Recommended range: [5, 25], default 10
    uint256 public constant DEFAULT_C = 10;

    /// @notice Default prior mean (0.5 = neutral assumption)
    /// @dev Represents expected score before any evidence
    uint256 public constant DEFAULT_M = 5e17; // 0.5 * 1e18

    // ============ Core Functions ============

    /**
     * @notice Calculate Bayesian weighted reputation score
     * @dev Formula: (n * avg + C * m) / (n + C)
     *      Expanded: (successCount + C * m) / (totalCalls + C)
     *      
     * @param totalCalls Total number of service calls/ratings
     * @param successCount Cumulative success score (each success = 1e18)
     * @param C Confidence constant (prior strength)
     * @param m Prior mean in 1e18 fixed-point
     * @return score Bayesian score in 1e18 fixed-point [0, 1e18]
     * 
     * @custom:example
     *   - 0 calls: returns m (prior mean)
     *   - 10 calls, 10 successes, C=10, m=0.5e18: returns 0.75e18
     *   - 100 calls, 90 successes, C=10, m=0.5e18: returns ~0.86e18
     */
    function calculateBayesianScore(
        uint256 totalCalls,
        uint256 successCount,
        uint256 C,
        uint256 m
    ) internal pure returns (uint256 score) {
        // Edge case: no data, return prior mean
        if (totalCalls == 0) {
            return m;
        }

        // Main formula: (successCount + C * m) / (totalCalls + C)
        // successCount is already sum of (1e18 per success)
        // So numerator = successCount + C * m
        // Denominator = totalCalls + C
        
        uint256 numerator = successCount + (C * m);
        uint256 denominator = totalCalls + C;

        // Safe division (Solidity 0.8+ handles division by zero)
        score = numerator / denominator;

        return score;
    }

    /**
     * @notice Calculate Bayesian score with default parameters
     * @dev Convenience function using DEFAULT_C and DEFAULT_M
     * @param totalCalls Total number of service calls
     * @param successCount Cumulative success score (each success = 1e18)
     * @return score Bayesian score in 1e18 fixed-point
     */
    function calculateBayesianScoreDefault(
        uint256 totalCalls,
        uint256 successCount
    ) internal pure returns (uint256 score) {
        return calculateBayesianScore(totalCalls, successCount, DEFAULT_C, DEFAULT_M);
    }

    /**
     * @notice Wilson Score simplified (Laplace smoothing)
     * @dev Formula: (successes + 1) / (n + 2)
     *      Equivalent to Beta(1,1) prior posterior mean
     *      More conservative than Bayesian average
     *      
     * @param successCount Number of successes
     * @param totalCalls Total number of calls
     * @return score Wilson score in 1e18 fixed-point
     */
    function calculateWilsonSimple(
        uint256 successCount,
        uint256 totalCalls
    ) internal pure returns (uint256 score) {
        // (successes + 1) / (n + 2) * PRECISION
        score = ((successCount + 1) * PRECISION) / (totalCalls + 2);
        return score;
    }

    // ============ Utility Functions ============

    /**
     * @notice Calculate the number of fake calls needed to reach target score
     * @dev Used for attack cost analysis
     *      Derived from: target = (n * 1 + C * m) / (n + C)
     *      Solving for n: n = C * (target - m) / (1e18 - target)
     *      
     * @param targetScore Target score to achieve (1e18 fixed-point)
     * @param C Confidence constant
     * @param m Prior mean
     * @return callsNeeded Number of all-success calls needed
     */
    function calculateCallsToReachScore(
        uint256 targetScore,
        uint256 C,
        uint256 m
    ) internal pure returns (uint256 callsNeeded) {
        // Guard: target must be > m and < 1e18
        if (targetScore <= m || targetScore >= PRECISION) {
            return 0;
        }

        // n = C * (target - m) / (PRECISION - target)
        uint256 numerator = C * (targetScore - m);
        uint256 denominator = PRECISION - targetScore;

        callsNeeded = numerator / denominator;
        
        // Round up to ensure target is actually reached
        if (numerator % denominator != 0) {
            callsNeeded += 1;
        }

        return callsNeeded;
    }
}
