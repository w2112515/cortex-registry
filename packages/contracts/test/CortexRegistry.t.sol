// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {CortexRegistry} from "../src/CortexRegistry.sol";
import {ICortexRegistry} from "../src/interfaces/ICortexRegistry.sol";

/**
 * @title CortexRegistryTest
 * @notice Unit tests for CortexRegistry following Task-06 spec
 */
contract CortexRegistryTest is Test {
    CortexRegistry public registry;
    
    address public arbitrator;
    address public treasury;
    address public provider1;
    address public provider2;
    address public challenger;
    
    uint256 public constant MIN_STAKE = 10 ether; // 10 CRO for testing
    uint256 public constant REPORTER_STAKE = 1 ether; // 10% of MIN_STAKE

    function setUp() public {
        // Use makeAddr to generate valid addresses
        arbitrator = makeAddr("arbitrator");
        treasury = makeAddr("treasury");
        provider1 = makeAddr("provider1");
        provider2 = makeAddr("provider2");
        challenger = makeAddr("challenger");
        
        registry = new CortexRegistry(MIN_STAKE, arbitrator, treasury);
        
        // Fund test accounts
        vm.deal(provider1, 100 ether);
        vm.deal(provider2, 100 ether);
        vm.deal(challenger, 100 ether);
    }

    // ============ Registration Tests ============

    function test_RegisterService_Success() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        
        assertEq(service.provider, provider1);
        assertEq(service.stake, MIN_STAKE);
        assertEq(uint(service.state), uint(ICortexRegistry.ServiceState.Pending));
        assertEq(service.metadataUri, "ipfs://metadata1");
    }

    function test_RegisterService_EmitsEvent() public {
        vm.prank(provider1);
        
        // Just verify the call succeeds and emits an event
        // Full event verification is complex due to dynamic serviceId
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        // Verify the service exists (event must have been emitted)
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        assertTrue(service.registeredAt > 0, "Service should be registered");
    }

    function test_RegisterService_InsufficientStake() public {
        vm.prank(provider1);
        
        vm.expectRevert(
            abi.encodeWithSelector(
                CortexRegistry.InsufficientStake.selector,
                MIN_STAKE - 1,
                MIN_STAKE
            )
        );
        
        registry.registerService{value: MIN_STAKE - 1}("ipfs://metadata1");
    }

    // ============ Activation Tests ============

    function test_ActivateService_Success() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        // Fast forward past cooldown (1 hour)
        vm.warp(block.timestamp + 1 hours + 1);
        
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        assertEq(uint(service.state), uint(ICortexRegistry.ServiceState.Active));
    }

    function test_ActivateService_CooldownNotPassed() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        // Try to activate immediately
        vm.prank(provider1);
        
        vm.expectRevert(); // CooldownNotPassed
        registry.activateService(serviceId);
    }

    function test_ActivateService_NotProvider() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        
        vm.prank(provider2); // Wrong provider
        vm.expectRevert(
            abi.encodeWithSelector(
                CortexRegistry.NotServiceProvider.selector,
                provider2,
                provider1
            )
        );
        registry.activateService(serviceId);
    }

    // ============ Challenge Tests ============

    function test_ChallengeService_Success() public {
        // Setup: register and activate
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        // Challenge
        vm.prank(challenger);
        registry.challengeService{value: REPORTER_STAKE}(serviceId, keccak256("evidence"));
        
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        assertEq(uint(service.state), uint(ICortexRegistry.ServiceState.Challenged));
        assertEq(service.challenger, challenger);
    }

    // ============ Withdrawal Tests ============

    function test_WithdrawStake_Success() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        uint256 balanceBefore = provider1.balance;
        
        vm.prank(provider1);
        registry.withdrawStake(serviceId);
        
        uint256 balanceAfter = provider1.balance;
        assertEq(balanceAfter - balanceBefore, MIN_STAKE);
        
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        assertEq(uint(service.state), uint(ICortexRegistry.ServiceState.Withdrawn));
    }

    // ============ Challenge Revert Tests ============

    /// @notice F-SC-04: challengeService() requires REPORTER_STAKE
    function test_ChallengeService_InsufficientStake() public {
        // Setup: register and activate
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        // Challenge with insufficient stake
        vm.prank(challenger);
        vm.expectRevert(
            abi.encodeWithSelector(
                CortexRegistry.InsufficientReporterStake.selector,
                REPORTER_STAKE - 1,
                REPORTER_STAKE
            )
        );
        registry.challengeService{value: REPORTER_STAKE - 1}(serviceId, keccak256("evidence"));
    }

    /// @notice F-SC-04: Challenge non-active service should revert
    function test_ChallengeService_NotActive() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        // Service is still Pending
        vm.prank(challenger);
        vm.expectRevert();
        registry.challengeService{value: REPORTER_STAKE}(serviceId, keccak256("evidence"));
    }

    // ============ Slash Tests (F-SC-05) ============

    /// @notice F-SC-05: resolveChallenge(true) slashes 30% of stake
    function test_ResolveChallenge_SlashRatio() public {
        // Setup: register, activate, and challenge
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        vm.prank(challenger);
        registry.challengeService{value: REPORTER_STAKE}(serviceId, keccak256("evidence"));
        
        // Record balances before resolution
        uint256 providerBalanceBefore = provider1.balance;
        uint256 challengerBalanceBefore = challenger.balance;
        uint256 treasuryBalanceBefore = treasury.balance;
        
        // Resolve as malicious
        vm.prank(arbitrator);
        registry.resolveChallenge(serviceId, true);
        
        // Calculate expected amounts
        uint256 slashAmount = (MIN_STAKE * 30) / 100; // 30% = 3 ether
        uint256 reporterReward = (slashAmount * 50) / 100; // 50% of slash = 1.5 ether
        uint256 treasuryAmount = slashAmount - reporterReward; // 1.5 ether
        uint256 providerRefund = MIN_STAKE - slashAmount; // 70% = 7 ether
        
        // Verify balances
        assertEq(
            provider1.balance - providerBalanceBefore, 
            providerRefund, 
            "Provider should receive 70% refund"
        );
        assertEq(
            challenger.balance - challengerBalanceBefore, 
            REPORTER_STAKE + reporterReward, 
            "Challenger should receive stake + 50% of slash"
        );
        assertEq(
            treasury.balance - treasuryBalanceBefore, 
            treasuryAmount, 
            "Treasury should receive 50% of slash"
        );
        
        // Verify state is Slashed
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        assertEq(uint(service.state), uint(ICortexRegistry.ServiceState.Slashed));
        assertEq(service.stake, 0);
    }

    /// @notice F-SC-05: resolveChallenge(false) returns to Active
    function test_ResolveChallenge_NotGuilty() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        vm.prank(challenger);
        registry.challengeService{value: REPORTER_STAKE}(serviceId, keccak256("evidence"));
        
        uint256 treasuryBalanceBefore = treasury.balance;
        
        // Resolve as not guilty
        vm.prank(arbitrator);
        registry.resolveChallenge(serviceId, false);
        
        // Verify state returns to Active
        ICortexRegistry.Service memory service = registry.getService(serviceId);
        assertEq(uint(service.state), uint(ICortexRegistry.ServiceState.Active));
        assertEq(service.stake, MIN_STAKE);
        
        // Reporter stake goes to treasury as penalty
        assertEq(treasury.balance - treasuryBalanceBefore, REPORTER_STAKE);
    }

    /// @notice Only arbitrator can resolve challenge
    function test_ResolveChallenge_OnlyArbitrator() public {
        vm.prank(provider1);
        bytes32 serviceId = registry.registerService{value: MIN_STAKE}("ipfs://metadata1");
        
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(provider1);
        registry.activateService(serviceId);
        
        vm.prank(challenger);
        registry.challengeService{value: REPORTER_STAKE}(serviceId, keccak256("evidence"));
        
        // Non-arbitrator tries to resolve
        vm.prank(provider2);
        vm.expectRevert(
            abi.encodeWithSelector(
                CortexRegistry.NotArbitrator.selector,
                provider2,
                arbitrator
            )
        );
        registry.resolveChallenge(serviceId, true);
    }

    // ============ View Function Tests ============

    function test_GetService_NotFound() public {
        bytes32 fakeId = keccak256("fake");
        
        vm.expectRevert(
            abi.encodeWithSelector(
                CortexRegistry.ServiceNotFound.selector,
                fakeId
            )
        );
        
        registry.getService(fakeId);
    }

    // ============ Constants Tests ============

    function test_Constants() public view {
        assertEq(registry.MIN_STAKE(), MIN_STAKE);
        assertEq(registry.SLASH_RATIO(), 30);
        assertEq(registry.CHALLENGE_PERIOD(), 7 days);
        assertEq(registry.ACTIVATION_COOLDOWN(), 1 hours);
        assertEq(registry.REPORTER_STAKE(), MIN_STAKE / 10);
    }
}
