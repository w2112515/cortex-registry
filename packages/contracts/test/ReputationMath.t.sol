// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {ReputationMath} from "../src/lib/ReputationMath.sol";

/**
 * @title ReputationMathTest
 * @notice Unit tests for ReputationMath library following TAP-1 spec
 * @dev Test cases from docs/arsenal/bayesian_reputation_whitepaper.md
 */
contract ReputationMathTest is Test {
    using ReputationMath for *;
    
    uint256 constant PRECISION = 1e18;
    uint256 constant DEFAULT_C = 10;
    uint256 constant DEFAULT_M = 5e17; // 0.5e18

    // ============ Bayesian Score Tests ============

    /// @notice Test zero calls returns prior mean
    function test_Bayesian_ZeroCalls() public pure {
        uint256 score = ReputationMath.calculateBayesianScore(0, 0, DEFAULT_C, DEFAULT_M);
        assertEq(score, DEFAULT_M, "Zero calls should return prior mean");
    }

    /// @notice Test 10 calls with 10 successes (from TAP-1 table)
    function test_Bayesian_10Calls_AllSuccess() public pure {
        // 10 calls, each success = 1e18, so successCount = 10e18
        uint256 totalCalls = 10;
        uint256 successCount = 10 * PRECISION; // 10e18
        
        uint256 score = ReputationMath.calculateBayesianScore(
            totalCalls, 
            successCount, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        // Expected: (10 * 1 + 10 * 0.5) / (10 + 10) = 15/20 = 0.75
        // In fixed-point: 0.75e18 = 7.5e17
        uint256 expected = 75e16; // 0.75e18
        assertEq(score, expected, "10 calls with all success should be 0.75e18");
    }

    /// @notice Test 100 calls with 90 successes (from TAP-1 table)
    function test_Bayesian_100Calls_90Success() public pure {
        uint256 totalCalls = 100;
        uint256 successCount = 90 * PRECISION; // 90e18
        
        uint256 score = ReputationMath.calculateBayesianScore(
            totalCalls, 
            successCount, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        // Expected: (90e18 + 10 * 0.5e18) / (100 + 10)
        //         = (90e18 + 5e18) / 110
        //         = 95e18 / 110
        //         ≈ 0.8636e18
        uint256 expected = (90 * PRECISION + DEFAULT_C * DEFAULT_M) / (100 + DEFAULT_C);
        assertEq(score, expected, "100 calls with 90 success should be ~0.86e18");
        
        // Verify it's approximately 0.86e18
        assertTrue(score > 86e16 && score < 87e16, "Score should be ~0.86");
    }

    /// @notice F-SC-06: Exact test case from Vol.5 §1.1 acceptance criteria
    /// @dev calculateBayesianScore(10, 8e18, 10, 5e17) should return 6.5e17 ± 1e16
    function test_Bayesian_Vol5_AcceptanceCriteria() public pure {
        // 10 calls, 8 successes (8e18 in fixed-point)
        uint256 totalCalls = 10;
        uint256 successCount = 8 * PRECISION; // 8e18
        
        uint256 score = ReputationMath.calculateBayesianScore(
            totalCalls, 
            successCount, 
            DEFAULT_C,   // C = 10
            DEFAULT_M    // m = 0.5e18
        );
        
        // Expected: (n * avg + C * m) / (n + C)
        //         = (8e18 + 10 * 0.5e18) / (10 + 10)
        //         = (8e18 + 5e18) / 20
        //         = 13e18 / 20
        //         = 0.65e18 = 6.5e17
        uint256 expected = 65e16; // 0.65e18 = 6.5e17
        uint256 tolerance = 1e16; // ± 0.01
        
        // Verify exact calculation
        assertEq(score, expected, "F-SC-06: 10 calls, 8 success should be exactly 6.5e17");
        
        // Double-verify within tolerance range
        assertTrue(
            score >= expected - tolerance && score <= expected + tolerance,
            "Score should be 6.5e17 +/- 1e16"
        );
    }

    /// @notice Test default parameters convenience function
    function test_Bayesian_DefaultParams() public pure {
        uint256 score = ReputationMath.calculateBayesianScoreDefault(10, 10 * PRECISION);
        uint256 scoreWithParams = ReputationMath.calculateBayesianScore(
            10, 10 * PRECISION, DEFAULT_C, DEFAULT_M
        );
        
        assertEq(score, scoreWithParams, "Default function should match explicit params");
    }

    /// @notice Test score approaches 1.0 with many perfect calls
    function test_Bayesian_ApproachesOne() public pure {
        // 1000 calls, all success
        uint256 totalCalls = 1000;
        uint256 successCount = 1000 * PRECISION;
        
        uint256 score = ReputationMath.calculateBayesianScore(
            totalCalls, 
            successCount, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        // Expected: (1000 + 5) / (1000 + 10) = 1005/1010 ≈ 0.995
        assertTrue(score > 99e16, "1000 perfect calls should be > 0.99");
    }

    // ============ Wilson Score Tests ============

    /// @notice Test Wilson simple formula
    function test_Wilson_Basic() public pure {
        uint256 score = ReputationMath.calculateWilsonSimple(10, 10);
        // (10 + 1) / (10 + 2) * 1e18 = 11/12 * 1e18 ≈ 0.916e18
        assertTrue(score > 91e16 && score < 92e16, "Wilson score should be ~0.916");
    }

    /// @notice Test Wilson with zero successes
    function test_Wilson_ZeroSuccess() public pure {
        uint256 score = ReputationMath.calculateWilsonSimple(0, 10);
        // (0 + 1) / (10 + 2) * 1e18 = 1/12 * 1e18 ≈ 0.083e18
        assertTrue(score > 8e16 && score < 9e16, "Wilson with no success should be low");
    }

    // ============ Attack Cost Analysis ============

    /// @notice Test calculating calls needed to reach target score
    function test_CallsToReachScore() public pure {
        // From TAP-1 whitepaper attack cost table
        // Target 0.9 with C=10, m=0.5 needs ~40 calls
        uint256 targetScore = 9e17; // 0.9e18
        
        uint256 callsNeeded = ReputationMath.calculateCallsToReachScore(
            targetScore, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        // Expected: 10 * (0.9 - 0.5) / (1 - 0.9) = 10 * 0.4 / 0.1 = 40
        assertEq(callsNeeded, 40, "Need 40 perfect calls to reach 0.9");
    }

    /// @notice Test edge case: target equals prior mean
    function test_CallsToReachScore_AtPrior() public pure {
        uint256 callsNeeded = ReputationMath.calculateCallsToReachScore(
            DEFAULT_M, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        assertEq(callsNeeded, 0, "Already at prior, need 0 calls");
    }

    /// @notice Test edge case: target >= 1.0
    function test_CallsToReachScore_Impossible() public pure {
        uint256 callsNeeded = ReputationMath.calculateCallsToReachScore(
            PRECISION, // 1.0
            DEFAULT_C, 
            DEFAULT_M
        );
        
        assertEq(callsNeeded, 0, "Impossible target returns 0");
    }

    // ============ Fuzz Tests ============

    /// @notice Fuzz test: score should always be >= m when all success
    function testFuzz_Bayesian_AllSuccess_GreaterThanPrior(uint256 calls) public pure {
        vm.assume(calls > 0 && calls < 1e9); // Reasonable range
        
        uint256 successCount = calls * PRECISION;
        uint256 score = ReputationMath.calculateBayesianScore(
            calls, 
            successCount, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        assertTrue(score >= DEFAULT_M, "All success should be >= prior");
    }

    /// @notice Fuzz test: score should always be <= m when all failure
    function testFuzz_Bayesian_AllFailure_LessThanPrior(uint256 calls) public pure {
        vm.assume(calls > 0 && calls < 1e9);
        
        uint256 successCount = 0;
        uint256 score = ReputationMath.calculateBayesianScore(
            calls, 
            successCount, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        assertTrue(score <= DEFAULT_M, "All failure should be <= prior");
    }

    /// @notice Fuzz test: score should converge to true rate with many calls
    function testFuzz_Bayesian_Convergence(uint256 calls, uint256 successRate) public pure {
        vm.assume(calls > 100 && calls < 1e9);
        vm.assume(successRate <= 100);
        
        uint256 successCount = (calls * successRate * PRECISION) / 100;
        uint256 score = ReputationMath.calculateBayesianScore(
            calls, 
            successCount, 
            DEFAULT_C, 
            DEFAULT_M
        );
        
        // With many calls (>100), prior has minimal impact
        // Score should be within 10% of true rate
        uint256 trueRate = (successRate * PRECISION) / 100;
        uint256 tolerance = PRECISION / 10; // 10%
        
        if (trueRate > tolerance) {
            assertTrue(
                score > trueRate - tolerance && score < trueRate + tolerance,
                "Score should converge to true rate"
            );
        }
    }
}
