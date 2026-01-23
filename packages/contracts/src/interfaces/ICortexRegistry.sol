// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/**
 * @title ICortexRegistry
 * @notice Core interface for the CortexRegistry protocol - decentralized MCP service discovery
 * @dev All stake amounts are in native CRO tokens. Implements TAP-2 state machine from Vol.3 §3
 */
interface ICortexRegistry {
    // ============ Enums ============

    /**
     * @notice Service lifecycle states following TAP-2 博弈论状态机
     * @dev State transitions:
     *   [*] --> Pending: registerService()
     *   Pending --> Active: activate() [after cooldown]
     *   Active --> Challenged: challengeService()
     *   Active --> Withdrawn: withdrawStake()
     *   Challenged --> Slashed: resolveChallenge(true)
     *   Challenged --> Active: resolveChallenge(false)
     */
    enum ServiceState {
        Pending,     // 服务已注册，等待激活
        Active,      // 服务正常运行
        Challenged,  // 服务被质疑，等待仲裁
        Slashed,     // 服务被惩罚 (终态)
        Withdrawn    // 服务主动退出 (终态)
    }

    // ============ Structs ============

    /**
     * @notice Service metadata and staking information
     * @param provider Service provider address
     * @param stake Amount of CRO staked (must >= MIN_STAKE)
     * @param state Current service state
     * @param metadataUri IPFS/Arweave URI pointing to MCP service metadata JSON
     * @param registeredAt Block timestamp when service was registered
     * @param challengeDeadline Block timestamp when challenge period ends (0 if not challenged)
     * @param challenger Address that initiated the challenge (address(0) if not challenged)
     */
    struct Service {
        address provider;
        uint256 stake;
        ServiceState state;
        string metadataUri;
        uint256 registeredAt;
        uint256 challengeDeadline;
        address challenger;
    }

    // ============ Events ============

    /**
     * @notice Emitted when a new service is registered
     * @param serviceId Unique identifier for the service
     * @param provider Address of the service provider
     * @param stake Amount of CRO staked
     */
    event ServiceRegistered(
        bytes32 indexed serviceId,
        address indexed provider,
        uint256 stake
    );

    /**
     * @notice Emitted when a pending service is activated
     * @param serviceId Unique identifier for the service
     */
    event ServiceActivated(bytes32 indexed serviceId);

    /**
     * @notice Emitted when a service is challenged
     * @param serviceId Unique identifier for the service
     * @param challenger Address that initiated the challenge
     */
    event ServiceChallenged(
        bytes32 indexed serviceId,
        address indexed challenger
    );

    /**
     * @notice Emitted when a service is slashed after a successful challenge
     * @param serviceId Unique identifier for the service
     * @param slashedAmount Amount of CRO slashed from provider
     */
    event ServiceSlashed(
        bytes32 indexed serviceId,
        uint256 slashedAmount
    );

    /**
     * @notice Emitted when a provider withdraws their stake
     * @param serviceId Unique identifier for the service
     */
    event ServiceWithdrawn(bytes32 indexed serviceId);

    /**
     * @notice Emitted when a challenge is resolved (slashed or dismissed)
     * @param serviceId Unique identifier for the service
     * @param isMalicious True if service was found malicious
     */
    event ChallengeResolved(
        bytes32 indexed serviceId,
        bool isMalicious
    );

    /**
     * @notice Emitted when service reputation score is updated
     * @param serviceId Unique identifier for the service
     * @param newScore Updated Bayesian reputation score (1e18 fixed-point)
     */
    event ReputationUpdated(
        bytes32 indexed serviceId,
        uint256 newScore
    );

    // ============ Core Functions ============

    /**
     * @notice Register a new MCP service with stake
     * @param metadataUri URI pointing to service metadata (IPFS/Arweave)
     * @return serviceId Unique identifier for the registered service
     * @dev Caller must send >= MIN_STAKE CRO. Service starts in Pending state.
     */
    function registerService(string calldata metadataUri) external payable returns (bytes32 serviceId);

    /**
     * @notice Activate a pending service after cooldown period
     * @param serviceId Unique identifier for the service
     * @dev Only callable by the service provider. Must be in Pending state.
     */
    function activateService(bytes32 serviceId) external;

    /**
     * @notice Challenge an active service with evidence of malicious behavior
     * @param serviceId Unique identifier for the service to challenge
     * @param evidence Hash of evidence proving malicious behavior
     * @dev Caller must send REPORTER_STAKE. Service must be Active.
     */
    function challengeService(bytes32 serviceId, bytes32 evidence) external payable;

    /**
     * @notice Resolve a pending challenge (arbitrator only)
     * @param serviceId Unique identifier for the challenged service
     * @param isMalicious True if service is confirmed malicious, false otherwise
     * @dev If malicious: slash provider, reward reporter. If not: return reporter stake.
     */
    function resolveChallenge(bytes32 serviceId, bool isMalicious) external;

    /**
     * @notice Withdraw stake from an active service
     * @param serviceId Unique identifier for the service
     * @dev Only callable by the service provider. Service must be Active.
     */
    function withdrawStake(bytes32 serviceId) external;

    // ============ View Functions ============

    /**
     * @notice Get service details by ID
     * @param serviceId Unique identifier for the service
     * @return service Service struct containing all details
     */
    function getService(bytes32 serviceId) external view returns (Service memory);
}
