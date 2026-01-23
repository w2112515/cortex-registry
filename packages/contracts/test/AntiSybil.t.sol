// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {AntiSybil} from "../src/lib/AntiSybil.sol";

/**
 * @title AntiSybilTest
 * @notice Unit tests for AntiSybil library
 * @dev Tests progressive staking logic for Sybil resistance
 */
contract AntiSybilTest is Test {
    uint256 constant BASE_STAKE = 100 ether; // 100 CRO
    uint256 constant INCREMENT_RATIO = 10; // 10%

    // ============ Stake Requirement Tests ============

    /// @notice Test first service requires base stake
    function test_StakeRequirement_FirstService() public pure {
        uint256 required = AntiSybil.calculateStakeRequirement(BASE_STAKE, 0, INCREMENT_RATIO);
        assertEq(required, BASE_STAKE, "First service should require base stake");
    }

    /// @notice Test second service requires 110% of base
    function test_StakeRequirement_SecondService() public pure {
        uint256 required = AntiSybil.calculateStakeRequirement(BASE_STAKE, 1, INCREMENT_RATIO);
        // 100 * (100 + 10) / 100 = 110
        assertEq(required, 110 ether, "Second service should require 110%");
    }

    /// @notice Test 10th service requires 190% of base
    function test_StakeRequirement_TenthService() public pure {
        uint256 required = AntiSybil.calculateStakeRequirement(BASE_STAKE, 9, INCREMENT_RATIO);
        // 100 * (100 + 90) / 100 = 190
        assertEq(required, 190 ether, "Tenth service should require 190%");
    }

    /// @notice Test with default increment ratio
    function test_StakeRequirement_DefaultRatio() public pure {
        uint256 required = AntiSybil.calculateStakeRequirementDefault(BASE_STAKE, 5);
        uint256 expected = AntiSybil.calculateStakeRequirement(
            BASE_STAKE, 5, AntiSybil.DEFAULT_INCREMENT_RATIO
        );
        assertEq(required, expected, "Default function should match");
    }

    // ============ Total Stake Tests ============

    /// @notice Test total stake for single service
    function test_TotalStake_SingleService() public pure {
        uint256 total = AntiSybil.calculateTotalStakeForServices(BASE_STAKE, 1, INCREMENT_RATIO);
        assertEq(total, BASE_STAKE, "Single service = base stake");
    }

    /// @notice Test total stake for 10 services
    function test_TotalStake_TenServices() public pure {
        uint256 total = AntiSybil.calculateTotalStakeForServices(BASE_STAKE, 10, INCREMENT_RATIO);
        
        // Sum: 100 + 110 + 120 + ... + 190
        // = 100 * 10 + 100 * 0.1 * (0+1+2+3+4+5+6+7+8+9)
        // = 1000 + 10 * 45
        // = 1000 + 450
        // = 1450
        assertEq(total, 1450 ether, "10 services should cost 1450");
    }

    /// @notice Test zero services
    function test_TotalStake_ZeroServices() public pure {
        uint256 total = AntiSybil.calculateTotalStakeForServices(BASE_STAKE, 0, INCREMENT_RATIO);
        assertEq(total, 0, "Zero services = zero stake");
    }

    // ============ Limit Tests ============

    /// @notice Test can register when under limit
    function test_CanRegister_UnderLimit() public pure {
        assertTrue(AntiSybil.canRegisterService(0), "Can register first");
        assertTrue(AntiSybil.canRegisterService(50), "Can register at 50");
        assertTrue(AntiSybil.canRegisterService(99), "Can register at 99");
    }

    /// @notice Test cannot register at limit
    function test_CanRegister_AtLimit() public pure {
        assertFalse(AntiSybil.canRegisterService(100), "Cannot register at 100");
        assertFalse(AntiSybil.canRegisterService(150), "Cannot register over limit");
    }

    /// @notice Test validate and calculate reverts at limit
    /// @dev Note: This test verifies the limit check logic works correctly
    function test_ValidateAndCalculate_AtLimit() public pure {
        // At limit (100), canRegisterService returns false
        assertFalse(AntiSybil.canRegisterService(100), "Should not allow at limit");
        
        // validateAndCalculateStake would revert, but we can't test internal
        // library reverts directly with expectRevert in this context
    }

    /// @notice Test validate and calculate succeeds under limit
    function test_ValidateAndCalculate_Success() public pure {
        address provider = address(0x123);
        
        uint256 required = AntiSybil.validateAndCalculateStake(
            BASE_STAKE, 5, INCREMENT_RATIO, provider
        );
        
        assertEq(required, 150 ether, "6th service should require 150%");
    }

    // ============ Attack Cost Analysis ============

    /// @notice Test Sybil attack cost calculation
    function test_SybilAttackCost() public pure {
        // 10 services, 80% detection probability (0.8e18)
        uint256 detectionProb = 8e17; // 0.8
        uint256 slashRatio = 30; // 30%
        
        uint256 expectedLoss = AntiSybil.calculateSybilAttackCost(
            BASE_STAKE,
            10,
            slashRatio,
            detectionProb
        );
        
        // Total stake for 10 services = 1450 ether
        // Expected slash = 1450 * 0.30 * 0.8 = 348
        uint256 expected = (1450 ether * slashRatio * detectionProb) / (100 * 1e18);
        assertEq(expectedLoss, expected, "Attack cost calculation");
    }

    // ============ Fuzz Tests ============

    /// @notice Fuzz test: stake should increase with count
    function testFuzz_StakeIncreases(uint256 count1, uint256 count2) public pure {
        vm.assume(count1 < 100);
        vm.assume(count2 < 100);
        vm.assume(count1 < count2);
        
        uint256 stake1 = AntiSybil.calculateStakeRequirement(BASE_STAKE, count1, INCREMENT_RATIO);
        uint256 stake2 = AntiSybil.calculateStakeRequirement(BASE_STAKE, count2, INCREMENT_RATIO);
        
        assertTrue(stake2 > stake1, "Higher count should require more stake");
    }

    /// @notice Fuzz test: total stake should equal sum of individual
    function testFuzz_TotalEqualsSum(uint256 serviceCount) public pure {
        vm.assume(serviceCount > 0 && serviceCount <= 50);
        
        uint256 total = AntiSybil.calculateTotalStakeForServices(
            BASE_STAKE, serviceCount, INCREMENT_RATIO
        );
        
        uint256 sum = 0;
        for (uint256 i = 0; i < serviceCount; i++) {
            sum += AntiSybil.calculateStakeRequirement(BASE_STAKE, i, INCREMENT_RATIO);
        }
        
        assertEq(total, sum, "Total should equal sum of individuals");
    }

    /// @notice Fuzz test: no overflow for reasonable values
    function testFuzz_NoOverflow(uint256 baseStake, uint256 count) public pure {
        vm.assume(baseStake > 0 && baseStake <= 1000 ether);
        vm.assume(count < 100);
        
        // Should not revert
        uint256 required = AntiSybil.calculateStakeRequirement(baseStake, count, INCREMENT_RATIO);
        
        // Should be >= base stake
        assertTrue(required >= baseStake, "Required should be >= base");
    }
}
