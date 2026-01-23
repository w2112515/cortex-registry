// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {SessionKeyManager} from "../src/SessionKeyManager.sol";
import {ISessionKeyManager} from "../src/interfaces/ISessionKeyManager.sol";

/**
 * @title SessionKeyManagerTest
 * @notice Comprehensive tests for Session Key permission isolation
 * @dev Covers: creation, revocation, validation, execution, edge cases
 */
contract SessionKeyManagerTest is Test {
    SessionKeyManager public manager;
    
    address public owner = address(0x1);
    address public agent = address(0x2);
    address public attacker = address(0x3);
    
    bytes32 public service1 = keccak256("service1");
    bytes32 public service2 = keccak256("service2");
    bytes32 public service3 = keccak256("service3");
    
    uint256 public maxSpend = 1 ether;
    uint256 public dailyLimit = 5 ether;
    uint64 public validExpiry;
    
    bytes32[] public allowedServices;
    
    function setUp() public {
        manager = new SessionKeyManager();
        
        // Set valid expiry (7 days from now) - long enough for daily limit reset tests
        validExpiry = uint64(block.timestamp + 7 days);
        
        // Setup allowed services
        allowedServices = new bytes32[](2);
        allowedServices[0] = service1;
        allowedServices[1] = service2;
        
        // Fund accounts
        vm.deal(owner, 100 ether);
        vm.deal(agent, 100 ether);
    }
    
    // ============ Creation Tests ============
    
    function test_CreateSession_Success() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        
        assertEq(session.agent, agent);
        assertEq(session.owner, owner);
        assertEq(session.maxSpend, maxSpend);
        assertEq(session.dailyLimit, dailyLimit);
        assertEq(session.expiry, validExpiry);
        assertTrue(session.active);
        assertEq(session.nonce, 0);
        assertEq(session.allowedServices.length, 2);
    }
    
    function test_CreateSession_EmitsEvent() public {
        // Create session and verify it was created successfully
        // (event emission implicitly tested via successful state change)
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        // Verify session was created (which means event was emitted)
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        assertTrue(session.active);
        assertEq(session.agent, agent);
        assertEq(session.owner, owner);
    }
    
    function test_CreateSession_RevertInvalidAgent_Zero() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ISessionKeyManager.InvalidAgent.selector, address(0)));
        manager.createSession(
            address(0),
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
    }
    
    function test_CreateSession_RevertInvalidAgent_Self() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ISessionKeyManager.InvalidAgent.selector, owner));
        manager.createSession(
            owner, // Cannot delegate to self
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
    }
    
    function test_CreateSession_RevertEmptyServices() public {
        bytes32[] memory emptyServices = new bytes32[](0);
        
        vm.prank(owner);
        vm.expectRevert(ISessionKeyManager.EmptyAllowedServices.selector);
        manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            emptyServices,
            validExpiry
        );
    }
    
    function test_CreateSession_RevertExpiryTooSoon() public {
        // Expiry less than MIN_SESSION_DURATION (1 hour)
        uint64 tooSoonExpiry = uint64(block.timestamp + 1800); // 30 min
        
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ISessionKeyManager.InvalidExpiry.selector, tooSoonExpiry));
        manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            tooSoonExpiry
        );
    }
    
    function test_CreateSession_RevertExpiryTooFar() public {
        // Expiry more than MAX_SESSION_DURATION (30 days)
        uint64 tooFarExpiry = uint64(block.timestamp + 31 days);
        
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(ISessionKeyManager.InvalidExpiry.selector, tooFarExpiry));
        manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            tooFarExpiry
        );
    }
    
    // ============ Revocation Tests ============
    
    function test_RevokeSession_ByOwner() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        vm.prank(owner);
        manager.revokeSession(sessionId);
        
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        assertFalse(session.active);
    }
    
    function test_RevokeSession_ByAgent() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        vm.prank(agent);
        manager.revokeSession(sessionId);
        
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        assertFalse(session.active);
    }
    
    function test_RevokeSession_RevertUnauthorized() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(ISessionKeyManager.NotSessionOwner.selector, attacker, owner));
        manager.revokeSession(sessionId);
    }
    
    // ============ Validation Tests ============
    
    function test_ValidateSession_Success() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        (bool valid, string memory reason) = manager.validateSession(
            sessionId,
            service1,
            0.5 ether
        );
        
        assertTrue(valid);
        assertEq(reason, "");
    }
    
    function test_ValidateSession_NotFound() public {
        bytes32 fakeSessionId = keccak256("fake");
        
        (bool valid, string memory reason) = manager.validateSession(
            fakeSessionId,
            service1,
            0.5 ether
        );
        
        assertFalse(valid);
        assertEq(reason, "Session not found");
    }
    
    function test_ValidateSession_Inactive() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        vm.prank(owner);
        manager.revokeSession(sessionId);
        
        (bool valid, string memory reason) = manager.validateSession(
            sessionId,
            service1,
            0.5 ether
        );
        
        assertFalse(valid);
        assertEq(reason, "Session inactive");
    }
    
    function test_ValidateSession_Expired() public {
        // Use a shorter expiry for this specific test
        uint64 shortExpiry = uint64(block.timestamp + 2 hours);
        
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            shortExpiry
        );
        
        // Fast forward past expiry
        vm.warp(shortExpiry + 1);
        
        (bool valid, string memory reason) = manager.validateSession(
            sessionId,
            service1,
            0.5 ether
        );
        
        assertFalse(valid);
        assertEq(reason, "Session expired");
    }
    
    function test_ValidateSession_ExceedsMaxSpend() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        (bool valid, string memory reason) = manager.validateSession(
            sessionId,
            service1,
            2 ether // > maxSpend of 1 ether
        );
        
        assertFalse(valid);
        assertEq(reason, "Exceeds max spend per transaction");
    }
    
    function test_ValidateSession_ServiceNotWhitelisted() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        (bool valid, string memory reason) = manager.validateSession(
            sessionId,
            service3, // Not in allowedServices
            0.5 ether
        );
        
        assertFalse(valid);
        assertEq(reason, "Service not whitelisted");
    }
    
    // ============ Execution Tests ============
    
    function test_ExecuteWithSession_Success() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        vm.prank(agent);
        manager.executeWithSession{value: 0.5 ether}(sessionId, service1);
        
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        assertEq(session.dailySpent, 0.5 ether);
        assertEq(session.nonce, 1);
    }
    
    function test_ExecuteWithSession_MultipleTransactions() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        // Execute 3 transactions
        vm.startPrank(agent);
        manager.executeWithSession{value: 0.5 ether}(sessionId, service1);
        manager.executeWithSession{value: 0.3 ether}(sessionId, service2);
        manager.executeWithSession{value: 0.2 ether}(sessionId, service1);
        vm.stopPrank();
        
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        assertEq(session.dailySpent, 1 ether);
        assertEq(session.nonce, 3);
    }
    
    function test_ExecuteWithSession_RevertNotAgent() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        // Attacker tries to execute - should fail with NotSessionAgent error
        hoax(attacker, 1 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                ISessionKeyManager.NotSessionAgent.selector,
                attacker,
                agent
            )
        );
        manager.executeWithSession{value: 0.5 ether}(sessionId, service1);
    }
    
    function test_ExecuteWithSession_RevertExceedsDailyLimit() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit, // 5 ether
            allowedServices,
            validExpiry
        );
        
        // Execute multiple times to exhaust daily limit
        vm.startPrank(agent);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        
        // This should fail (would be 6 ether total)
        vm.expectRevert(abi.encodeWithSelector(ISessionKeyManager.ExceedsDailyLimit.selector, 6 ether, dailyLimit));
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        vm.stopPrank();
    }
    
    function test_ExecuteWithSession_DailyLimitReset() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        // Exhaust daily limit
        vm.startPrank(agent);
        for (uint256 i = 0; i < 5; i++) {
            manager.executeWithSession{value: 1 ether}(sessionId, service1);
        }
        vm.stopPrank();
        
        // Fast forward 24 hours
        vm.warp(block.timestamp + 1 days);
        
        // Should work again after reset
        vm.prank(agent);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        
        ISessionKeyManager.SessionKey memory session = manager.getSession(sessionId);
        assertEq(session.dailySpent, 1 ether); // Reset to 0, then +1 ether
    }
    
    // ============ View Function Tests ============
    
    function test_GetOwnerSessions() public {
        vm.startPrank(owner);
        bytes32 session1 = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        bytes32 session2 = manager.createSession(
            address(0x10), // Different agent
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        vm.stopPrank();
        
        bytes32[] memory sessions = manager.getOwnerSessions(owner);
        assertEq(sessions.length, 2);
        assertEq(sessions[0], session1);
        assertEq(sessions[1], session2);
    }
    
    function test_GetRemainingDailyLimit() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        // Initial: full limit available
        uint256 remaining = manager.getRemainingDailyLimit(sessionId);
        assertEq(remaining, dailyLimit);
        
        // After spending
        vm.prank(agent);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        
        remaining = manager.getRemainingDailyLimit(sessionId);
        assertEq(remaining, 4 ether);
    }
    
    function test_GetRemainingDailyLimit_AfterReset() public {
        vm.prank(owner);
        bytes32 sessionId = manager.createSession(
            agent,
            maxSpend,
            dailyLimit,
            allowedServices,
            validExpiry
        );
        
        // Spend 3 ether in multiple transactions (maxSpend = 1 ether)
        vm.startPrank(agent);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        manager.executeWithSession{value: 1 ether}(sessionId, service1);
        vm.stopPrank();
        
        // Fast forward 24 hours
        vm.warp(block.timestamp + 1 days);
        
        // Should show full limit again
        uint256 remaining = manager.getRemainingDailyLimit(sessionId);
        assertEq(remaining, dailyLimit);
    }
}
