// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ICortexRegistry} from "./interfaces/ICortexRegistry.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CortexRegistry
 * @notice Decentralized MCP service registry with stake-based reputation
 * @dev Implements ICortexRegistry with TAP-2 game theory mechanics
 * 
 * Core invariants:
 * 1. No free lunch: MIN_STAKE must be > 0
 * 2. No admin gatekeeper: registration is permissionless
 * 3. Economic security: SLASH_RATIO enforces Nash equilibrium
 */
contract CortexRegistry is ICortexRegistry, ReentrancyGuard {
    // ============ Constants ============

    /// @notice Minimum stake required to register a service (100 CRO)
    /// @dev Can be adjusted for testnet via constructor, prod should be 100 ether
    uint256 public immutable MIN_STAKE;

    /// @notice Slash ratio in percentage (30%)
    uint256 public constant SLASH_RATIO = 30;

    /// @notice Challenge period duration (7 days)
    uint256 public constant CHALLENGE_PERIOD = 7 days;

    /// @notice Activation cooldown after registration (1 hour)
    uint256 public constant ACTIVATION_COOLDOWN = 1 hours;

    /// @notice Reporter stake required to challenge (10% of MIN_STAKE)
    uint256 public immutable REPORTER_STAKE;

    /// @notice Reporter reward ratio from slashed amount (50%)
    uint256 public constant REPORTER_REWARD_RATIO = 50;

    // ============ State ============

    /// @notice Arbitrator address for resolving challenges
    /// @dev Set at deployment, can be a multisig or DAO
    address public immutable arbitrator;

    /// @notice Treasury address for collecting protocol fees
    /// @dev Receives portion of slashed stakes
    address public immutable treasury;

    /// @notice Service storage: serviceId => Service
    mapping(bytes32 => Service) private _services;

    /// @notice Track if a service ID exists
    mapping(bytes32 => bool) private _serviceExists;

    /// @notice Reporter stakes: serviceId => amount staked by challenger
    mapping(bytes32 => uint256) private _reporterStakes;

    /// @notice Evidence hashes: serviceId => evidence hash
    mapping(bytes32 => bytes32) private _evidences;

    /// @notice Track service count per provider for AntiSybil


    // ============ Errors ============

    error InsufficientStake(uint256 sent, uint256 required);
    error ServiceNotFound(bytes32 serviceId);
    error ServiceAlreadyExists(bytes32 serviceId);
    error NotServiceProvider(address caller, address provider);
    error InvalidState(ServiceState current, ServiceState expected);
    error CooldownNotPassed(uint256 registeredAt, uint256 cooldownEnd);
    error NotArbitrator(address caller, address expected);
    error ChallengeAlreadyActive(bytes32 serviceId);
    error InsufficientReporterStake(uint256 sent, uint256 required);
    error TransferFailed(address to, uint256 amount);

    // ============ Constructor ============

    /**
     * @param _minStake Minimum stake required (use lower value for testnet)
     * @param _arbitrator Address authorized to resolve challenges
     * @param _treasury Address to receive protocol fees from slashing
     */
    constructor(uint256 _minStake, address _arbitrator, address _treasury) {
        require(_minStake > 0, "MIN_STAKE must be > 0");
        require(_arbitrator != address(0), "Arbitrator cannot be zero");
        require(_treasury != address(0), "Treasury cannot be zero");
        
        MIN_STAKE = _minStake;
        REPORTER_STAKE = _minStake / 10; // 10% of MIN_STAKE
        arbitrator = _arbitrator;
        treasury = _treasury;
    }

    // ============ Core Functions ============

    /**
     * @inheritdoc ICortexRegistry
     */
    function registerService(string calldata metadataUri) 
        external 
        payable 
        nonReentrant 
        returns (bytes32 serviceId) 
    {
        // Enforce minimum stake (Vol.1 §5: No Free Lunch)
        if (msg.value < MIN_STAKE) {
            revert InsufficientStake(msg.value, MIN_STAKE);
        }

        // Generate unique service ID
        serviceId = keccak256(abi.encodePacked(msg.sender, block.timestamp, metadataUri));
        
        // Prevent duplicate registrations
        if (_serviceExists[serviceId]) {
            revert ServiceAlreadyExists(serviceId);
        }

        // Create service in Pending state
        _services[serviceId] = Service({
            provider: msg.sender,
            stake: msg.value,
            state: ServiceState.Pending,
            metadataUri: metadataUri,
            registeredAt: block.timestamp,
            challengeDeadline: 0,
            challenger: address(0)
        });
        
        _serviceExists[serviceId] = true;

        emit ServiceRegistered(serviceId, msg.sender, msg.value);
    }

    /**
     * @inheritdoc ICortexRegistry
     */
    function activateService(bytes32 serviceId) external nonReentrant {
        Service storage service = _getService(serviceId);
        
        // Only provider can activate
        if (msg.sender != service.provider) {
            revert NotServiceProvider(msg.sender, service.provider);
        }
        
        // Must be in Pending state
        if (service.state != ServiceState.Pending) {
            revert InvalidState(service.state, ServiceState.Pending);
        }
        
        // Check cooldown period
        uint256 cooldownEnd = service.registeredAt + ACTIVATION_COOLDOWN;
        if (block.timestamp < cooldownEnd) {
            revert CooldownNotPassed(service.registeredAt, cooldownEnd);
        }
        
        // Transition to Active
        service.state = ServiceState.Active;
        
        emit ServiceActivated(serviceId);
    }

    /**
     * @inheritdoc ICortexRegistry
     * @dev Challenge logic will be fully implemented in Task-14/15
     */
    function challengeService(bytes32 serviceId, bytes32 evidence) 
        external 
        payable 
        nonReentrant 
    {
        Service storage service = _getService(serviceId);
        
        // Must be Active to challenge
        if (service.state != ServiceState.Active) {
            revert InvalidState(service.state, ServiceState.Active);
        }
        
        // Require reporter stake
        if (msg.value < REPORTER_STAKE) {
            revert InsufficientReporterStake(msg.value, REPORTER_STAKE);
        }
        
        // Prevent multiple challenges
        if (service.challenger != address(0)) {
            revert ChallengeAlreadyActive(serviceId);
        }
        
        // Update service state
        service.state = ServiceState.Challenged;
        service.challengeDeadline = block.timestamp + CHALLENGE_PERIOD;
        service.challenger = msg.sender;
        
        // Store reporter stake and evidence
        _reporterStakes[serviceId] = msg.value;
        _evidences[serviceId] = evidence;
        
        emit ServiceChallenged(serviceId, msg.sender);
    }

    /**
     * @inheritdoc ICortexRegistry
     * @dev Implements TAP-2 Nash equilibrium: slash ensures malicious strategy is unprofitable
     *      Uses call() instead of transfer() for gas safety
     */
    function resolveChallenge(bytes32 serviceId, bool isMalicious) 
        external 
        nonReentrant 
    {
        // Only arbitrator can resolve
        if (msg.sender != arbitrator) {
            revert NotArbitrator(msg.sender, arbitrator);
        }
        
        Service storage service = _getService(serviceId);
        
        // Must be Challenged
        if (service.state != ServiceState.Challenged) {
            revert InvalidState(service.state, ServiceState.Challenged);
        }
        
        address challenger = service.challenger;
        uint256 reporterStake = _reporterStakes[serviceId];
        
        // Clear reporter stake first (CEI pattern)
        _reporterStakes[serviceId] = 0;
        
        if (isMalicious) {
            // Calculate slash amount (30% of stake)
            uint256 slashAmount = (service.stake * SLASH_RATIO) / 100;
            uint256 reporterReward = (slashAmount * REPORTER_REWARD_RATIO) / 100;
            uint256 treasuryAmount = slashAmount - reporterReward;
            uint256 providerRefund = service.stake - slashAmount;
            
            // Update state before transfers (CEI pattern)
            service.state = ServiceState.Slashed;
            service.stake = 0;
            service.challenger = address(0);
            service.challengeDeadline = 0;
            
            // Transfer reporter stake + reward using call()
            uint256 totalToReporter = reporterStake + reporterReward;
            _safeTransfer(challenger, totalToReporter);
            
            // Transfer treasury portion
            _safeTransfer(treasury, treasuryAmount);
            
            // Refund remaining stake to provider
            if (providerRefund > 0) {
                _safeTransfer(service.provider, providerRefund);
            }
            
            emit ServiceSlashed(serviceId, slashAmount);
        } else {
            // Challenge failed - return to Active
            service.state = ServiceState.Active;
            service.challengeDeadline = 0;
            service.challenger = address(0);
            
            // Transfer reporter stake to treasury as penalty
            _safeTransfer(treasury, reporterStake);
        }
        
        emit ChallengeResolved(serviceId, isMalicious);
    }
    
    /**
     * @dev Safe transfer using call() with proper error handling
     * @param to Recipient address
     * @param amount Amount to transfer
     */
    function _safeTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        
        (bool success, ) = payable(to).call{value: amount}("");
        if (!success) {
            revert TransferFailed(to, amount);
        }
    }

    /**
     * @inheritdoc ICortexRegistry
     */
    function withdrawStake(bytes32 serviceId) external nonReentrant {
        Service storage service = _getService(serviceId);
        
        // Only provider can withdraw
        if (msg.sender != service.provider) {
            revert NotServiceProvider(msg.sender, service.provider);
        }
        
        // Must be Active (not challenged/slashed)
        if (service.state != ServiceState.Active) {
            revert InvalidState(service.state, ServiceState.Active);
        }
        
        uint256 stake = service.stake;
        
        // Update state before transfer (CEI pattern)
        service.state = ServiceState.Withdrawn;
        service.stake = 0;
        
        // Transfer stake back to provider using safe call
        _safeTransfer(msg.sender, stake);
        
        emit ServiceWithdrawn(serviceId);
    }

    // ============ View Functions ============

    /**
     * @inheritdoc ICortexRegistry
     */
    function getService(bytes32 serviceId) external view returns (Service memory) {
        if (!_serviceExists[serviceId]) {
            revert ServiceNotFound(serviceId);
        }
        return _services[serviceId];
    }

    // ============ Internal ============

    /**
     * @dev Get service with existence check
     */
    function _getService(bytes32 serviceId) internal view returns (Service storage) {
        if (!_serviceExists[serviceId]) {
            revert ServiceNotFound(serviceId);
        }
        return _services[serviceId];
    }
}
