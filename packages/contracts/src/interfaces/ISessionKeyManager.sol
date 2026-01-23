// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title ISessionKeyManager
 * @notice Interface for Session Key management - delegated payment authority for AI Agents
 * @dev Implements permission isolation following AgentFabric security model
 * 
 * Key Security Properties:
 * 1. Session keys NEVER have access to user's main private key
 * 2. All spending is bounded by maxSpend (per-tx) and dailyLimit (aggregate)
 * 3. Only whitelisted services can be called
 * 4. Time-bounded sessions with automatic expiry
 */
interface ISessionKeyManager {
    // ============ Structs ============

    /**
     * @notice Session Key configuration for an AI Agent
     * @param agent Delegated agent address (the session key holder)
     * @param owner Original owner who created this session
     * @param maxSpend Maximum amount allowed per single transaction (wei)
     * @param dailyLimit Maximum cumulative spending per 24h period (wei)
     * @param dailySpent Current amount spent today (resets at UTC midnight)
     * @param lastResetTime Timestamp of last daily reset
     * @param allowedServices Array of service IDs this session can interact with
     * @param expiry Unix timestamp when this session expires
     * @param active Whether this session is currently active
     * @param nonce Monotonic counter to prevent replay attacks
     */
    struct SessionKey {
        address agent;
        address owner;
        uint256 maxSpend;
        uint256 dailyLimit;
        uint256 dailySpent;
        uint256 lastResetTime;
        bytes32[] allowedServices;
        uint64 expiry;
        bool active;
        uint256 nonce;
    }

    // ============ Events ============

    /**
     * @notice Emitted when a new session is created
     * @param sessionId Unique identifier for the session
     * @param owner Address of the session owner
     * @param agent Delegated agent address
     * @param expiry Session expiry timestamp
     */
    event SessionCreated(
        bytes32 indexed sessionId,
        address indexed owner,
        address indexed agent,
        uint64 expiry
    );

    /**
     * @notice Emitted when a session is revoked
     * @param sessionId Unique identifier for the session
     * @param revokedBy Address that revoked (owner or agent)
     */
    event SessionRevoked(
        bytes32 indexed sessionId,
        address indexed revokedBy
    );

    /**
     * @notice Emitted when a payment is executed via session key
     * @param sessionId Session used for execution
     * @param serviceId Target service
     * @param amount Amount paid (wei)
     * @param newDailySpent Updated daily spending total
     */
    event SessionPayment(
        bytes32 indexed sessionId,
        bytes32 indexed serviceId,
        uint256 amount,
        uint256 newDailySpent
    );

    // ============ Errors ============

    error SessionNotFound(bytes32 sessionId);
    error SessionExpired(bytes32 sessionId, uint64 expiry);
    error SessionInactive(bytes32 sessionId);
    error NotSessionOwner(address caller, address owner);
    error NotSessionAgent(address caller, address agent);
    error ExceedsMaxSpend(uint256 amount, uint256 maxSpend);
    error ExceedsDailyLimit(uint256 newTotal, uint256 dailyLimit);
    error ServiceNotWhitelisted(bytes32 serviceId);
    error InvalidExpiry(uint64 expiry);
    error InvalidAgent(address agent);
    error EmptyAllowedServices();

    // ============ Core Functions ============

    /**
     * @notice Create a new session key for an AI agent
     * @param agent Address authorized to use this session
     * @param maxSpend Maximum amount per transaction (wei)
     * @param dailyLimit Maximum daily spending limit (wei)
     * @param allowedServices List of whitelisted service IDs
     * @param expiry Unix timestamp when session expires
     * @return sessionId Unique identifier for the created session
     */
    function createSession(
        address agent,
        uint256 maxSpend,
        uint256 dailyLimit,
        bytes32[] calldata allowedServices,
        uint64 expiry
    ) external returns (bytes32 sessionId);

    /**
     * @notice Revoke an existing session
     * @param sessionId Session to revoke
     * @dev Can be called by owner or agent themselves
     */
    function revokeSession(bytes32 sessionId) external;

    /**
     * @notice Validate if a session can execute a payment
     * @param sessionId Session to validate
     * @param serviceId Target service ID
     * @param amount Payment amount (wei)
     * @return valid True if payment can proceed
     * @return reason Failure reason if not valid (empty if valid)
     */
    function validateSession(
        bytes32 sessionId,
        bytes32 serviceId,
        uint256 amount
    ) external view returns (bool valid, string memory reason);

    /**
     * @notice Execute a payment using session key authority
     * @param sessionId Session authorizing the payment
     * @param serviceId Target service to pay
     * @dev Caller must be the session's agent. Payment comes from session owner.
     */
    function executeWithSession(
        bytes32 sessionId,
        bytes32 serviceId
    ) external payable;

    // ============ View Functions ============

    /**
     * @notice Get session details by ID
     * @param sessionId Session identifier
     * @return session Full session configuration
     */
    function getSession(bytes32 sessionId) external view returns (SessionKey memory);

    /**
     * @notice Get all active sessions for an owner
     * @param owner Owner address
     * @return sessionIds Array of active session IDs
     */
    function getOwnerSessions(address owner) external view returns (bytes32[] memory);

    /**
     * @notice Check remaining daily spending allowance
     * @param sessionId Session to check
     * @return remaining Amount still available today (wei)
     */
    function getRemainingDailyLimit(bytes32 sessionId) external view returns (uint256);
}
