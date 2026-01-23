// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ISessionKeyManager} from "./interfaces/ISessionKeyManager.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title SessionKeyManager
 * @notice Manage delegated payment sessions for AI Agents with permission isolation
 * @dev Implements Session Key pattern to allow AI agents to execute payments
 *      without access to user's main private key.
 * 
 * Security Model:
 * 1. Owner creates session with bounded permissions
 * 2. Agent can only spend within limits (per-tx + daily)
 * 3. Only whitelisted services are callable
 * 4. Sessions auto-expire and can be revoked anytime
 * 
 * Anti-Replay: Each session has a monotonic nonce incremented per execution
 */
contract SessionKeyManager is ISessionKeyManager, ReentrancyGuard {
    // ============ Constants ============

    /// @notice 24 hours in seconds for daily limit reset
    uint256 public constant DAY_SECONDS = 86400;

    /// @notice Minimum session duration (1 hour)
    uint64 public constant MIN_SESSION_DURATION = 3600;

    /// @notice Maximum session duration (30 days)
    uint64 public constant MAX_SESSION_DURATION = 30 days;

    // ============ Storage ============

    /// @notice Session storage: sessionId => SessionKey
    mapping(bytes32 => SessionKey) private _sessions;

    /// @notice Check if session exists
    mapping(bytes32 => bool) private _sessionExists;

    /// @notice Owner's active sessions: owner => sessionId[]
    mapping(address => bytes32[]) private _ownerSessions;

    /// @notice Session count per owner (for ID generation)
    mapping(address => uint256) private _sessionCount;

    // ============ Constructor ============

    constructor() {}

    // ============ Core Functions ============

    /**
     * @inheritdoc ISessionKeyManager
     */
    function createSession(
        address agent,
        uint256 maxSpend,
        uint256 dailyLimit,
        bytes32[] calldata allowedServices,
        uint64 expiry
    ) external nonReentrant returns (bytes32 sessionId) {
        // Validate inputs
        if (agent == address(0)) {
            revert InvalidAgent(agent);
        }
        if (agent == msg.sender) {
            revert InvalidAgent(agent); // Cannot delegate to self
        }
        if (allowedServices.length == 0) {
            revert EmptyAllowedServices();
        }
        if (expiry <= block.timestamp + MIN_SESSION_DURATION) {
            revert InvalidExpiry(expiry);
        }
        if (expiry > block.timestamp + MAX_SESSION_DURATION) {
            revert InvalidExpiry(expiry);
        }

        // Generate unique session ID
        _sessionCount[msg.sender]++;
        sessionId = keccak256(
            abi.encodePacked(
                msg.sender,
                agent,
                block.timestamp,
                _sessionCount[msg.sender]
            )
        );

        // Copy allowed services to storage
        bytes32[] memory servicesCopy = new bytes32[](allowedServices.length);
        for (uint256 i = 0; i < allowedServices.length; i++) {
            servicesCopy[i] = allowedServices[i];
        }

        // Create session
        _sessions[sessionId] = SessionKey({
            agent: agent,
            owner: msg.sender,
            maxSpend: maxSpend,
            dailyLimit: dailyLimit,
            dailySpent: 0,
            lastResetTime: block.timestamp,
            allowedServices: servicesCopy,
            expiry: expiry,
            active: true,
            nonce: 0
        });

        _sessionExists[sessionId] = true;
        _ownerSessions[msg.sender].push(sessionId);

        emit SessionCreated(sessionId, msg.sender, agent, expiry);
    }

    /**
     * @inheritdoc ISessionKeyManager
     */
    function revokeSession(bytes32 sessionId) external nonReentrant {
        SessionKey storage session = _getSession(sessionId);

        // Only owner or agent can revoke
        if (msg.sender != session.owner && msg.sender != session.agent) {
            revert NotSessionOwner(msg.sender, session.owner);
        }

        session.active = false;

        emit SessionRevoked(sessionId, msg.sender);
    }

    /**
     * @inheritdoc ISessionKeyManager
     */
    function validateSession(
        bytes32 sessionId,
        bytes32 serviceId,
        uint256 amount
    ) external view returns (bool valid, string memory reason) {
        if (!_sessionExists[sessionId]) {
            return (false, "Session not found");
        }

        SessionKey storage session = _sessions[sessionId];

        if (!session.active) {
            return (false, "Session inactive");
        }

        if (block.timestamp >= session.expiry) {
            return (false, "Session expired");
        }

        if (amount > session.maxSpend) {
            return (false, "Exceeds max spend per transaction");
        }

        // Check daily limit with potential reset
        uint256 currentDailySpent = session.dailySpent;
        if (block.timestamp >= session.lastResetTime + DAY_SECONDS) {
            currentDailySpent = 0; // Would be reset
        }

        if (currentDailySpent + amount > session.dailyLimit) {
            return (false, "Exceeds daily limit");
        }

        // Check service whitelist
        bool serviceAllowed = false;
        for (uint256 i = 0; i < session.allowedServices.length; i++) {
            if (session.allowedServices[i] == serviceId) {
                serviceAllowed = true;
                break;
            }
        }

        if (!serviceAllowed) {
            return (false, "Service not whitelisted");
        }

        return (true, "");
    }

    /**
     * @inheritdoc ISessionKeyManager
     */
    function executeWithSession(
        bytes32 sessionId,
        bytes32 serviceId
    ) external payable nonReentrant {
        SessionKey storage session = _getSession(sessionId);
        uint256 amount = msg.value;

        // Only agent can execute
        if (msg.sender != session.agent) {
            revert NotSessionAgent(msg.sender, session.agent);
        }

        // Check active
        if (!session.active) {
            revert SessionInactive(sessionId);
        }

        // Check expiry
        if (block.timestamp >= session.expiry) {
            revert SessionExpired(sessionId, session.expiry);
        }

        // Check max spend
        if (amount > session.maxSpend) {
            revert ExceedsMaxSpend(amount, session.maxSpend);
        }

        // Reset daily spent if 24h passed
        if (block.timestamp >= session.lastResetTime + DAY_SECONDS) {
            session.dailySpent = 0;
            session.lastResetTime = block.timestamp;
        }

        // Check daily limit
        uint256 newDailySpent = session.dailySpent + amount;
        if (newDailySpent > session.dailyLimit) {
            revert ExceedsDailyLimit(newDailySpent, session.dailyLimit);
        }

        // Check service whitelist
        bool serviceAllowed = false;
        for (uint256 i = 0; i < session.allowedServices.length; i++) {
            if (session.allowedServices[i] == serviceId) {
                serviceAllowed = true;
                break;
            }
        }
        if (!serviceAllowed) {
            revert ServiceNotWhitelisted(serviceId);
        }

        // Update state
        session.dailySpent = newDailySpent;
        session.nonce++;

        emit SessionPayment(sessionId, serviceId, amount, newDailySpent);

        // Note: In production, this would forward payment to the actual service
        // via CortexRegistry. For MVP, we just emit the event.
    }

    // ============ View Functions ============

    /**
     * @inheritdoc ISessionKeyManager
     */
    function getSession(bytes32 sessionId) external view returns (SessionKey memory) {
        if (!_sessionExists[sessionId]) {
            revert SessionNotFound(sessionId);
        }
        return _sessions[sessionId];
    }

    /**
     * @inheritdoc ISessionKeyManager
     */
    function getOwnerSessions(address owner) external view returns (bytes32[] memory) {
        return _ownerSessions[owner];
    }

    /**
     * @inheritdoc ISessionKeyManager
     */
    function getRemainingDailyLimit(bytes32 sessionId) external view returns (uint256) {
        if (!_sessionExists[sessionId]) {
            revert SessionNotFound(sessionId);
        }

        SessionKey storage session = _sessions[sessionId];

        // Check if daily reset should happen
        uint256 currentSpent = session.dailySpent;
        if (block.timestamp >= session.lastResetTime + DAY_SECONDS) {
            currentSpent = 0;
        }

        if (currentSpent >= session.dailyLimit) {
            return 0;
        }

        return session.dailyLimit - currentSpent;
    }

    // ============ Internal Functions ============

    /**
     * @dev Get session with existence check
     */
    function _getSession(bytes32 sessionId) internal view returns (SessionKey storage) {
        if (!_sessionExists[sessionId]) {
            revert SessionNotFound(sessionId);
        }
        return _sessions[sessionId];
    }
}
