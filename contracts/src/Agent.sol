// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Agent — onchain state anchor for Heppy Market AI trading agents
/// @notice AI analysis and trading decisions remain offchain; this contract records
///         agent creation, deposits, withdrawals, and tick executions on the rollup.
contract Agent {
    struct AgentInfo {
        bytes metadata;       // JSON-encoded offchain config (strategy, pair, etc.)
        uint256 balance;      // deposited funds in native GAS (wei units)
        bool exists;
        bool autoSignEnabled;
    }

    mapping(address => AgentInfo) public agents;

    // ─── Events ────────────────────────────────────────────────────────────────

    event AgentCreated(address indexed owner, bytes metadata, uint256 timestamp);
    event Deposited(address indexed owner, uint256 amount, uint256 newBalance);
    event Withdrawn(address indexed owner, uint256 amount, uint256 newBalance);
    event TickExecuted(address indexed owner, uint256 timestamp);
    event AutoSignEnabled(address indexed owner);
    event AutoSignDisabled(address indexed owner);
    event MetadataUpdated(address indexed owner, bytes newMetadata);

    // ─── Errors ─────────────────────────────────────────────────────────────────

    error AgentAlreadyExists();
    error AgentNotFound();
    error InsufficientBalance(uint256 requested, uint256 available);
    error TransferFailed();
    error ZeroDeposit();

    // ─── Mutating functions ─────────────────────────────────────────────────────

    /// @notice Create a new AI trading agent for the caller.
    /// @param metadata ABI-encoded or JSON bytes describing the agent (strategy, pair, etc.)
    function createAgent(bytes calldata metadata) external {
        if (agents[msg.sender].exists) revert AgentAlreadyExists();
        agents[msg.sender] = AgentInfo({
            metadata: metadata,
            balance: 0,
            exists: true,
            autoSignEnabled: false
        });
        emit AgentCreated(msg.sender, metadata, block.timestamp);
    }

    /// @notice Deposit native GAS into the agent vault.
    function deposit() external payable {
        if (!agents[msg.sender].exists) revert AgentNotFound();
        if (msg.value == 0) revert ZeroDeposit();
        agents[msg.sender].balance += msg.value;
        emit Deposited(msg.sender, msg.value, agents[msg.sender].balance);
    }

    /// @notice Withdraw funds from the agent vault.
    /// @param amount Amount in wei to withdraw
    function withdraw(uint256 amount) external {
        AgentInfo storage a = agents[msg.sender];
        if (!a.exists) revert AgentNotFound();
        if (a.balance < amount) revert InsufficientBalance(amount, a.balance);
        a.balance -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount, a.balance);
    }

    /// @notice Execute one AI analysis tick. Called by autosign on behalf of the user.
    ///         Actual AI logic is offchain; this anchors the event on-chain.
    function executeTick() external {
        if (!agents[msg.sender].exists) revert AgentNotFound();
        emit TickExecuted(msg.sender, block.timestamp);
    }

    /// @notice Enable autosign for repeated tick execution without manual approval.
    function enableAutoSign() external {
        if (!agents[msg.sender].exists) revert AgentNotFound();
        agents[msg.sender].autoSignEnabled = true;
        emit AutoSignEnabled(msg.sender);
    }

    /// @notice Disable autosign.
    function disableAutoSign() external {
        if (!agents[msg.sender].exists) revert AgentNotFound();
        agents[msg.sender].autoSignEnabled = false;
        emit AutoSignDisabled(msg.sender);
    }

    /// @notice Update agent metadata (e.g. strategy change).
    function updateMetadata(bytes calldata newMetadata) external {
        if (!agents[msg.sender].exists) revert AgentNotFound();
        agents[msg.sender].metadata = newMetadata;
        emit MetadataUpdated(msg.sender, newMetadata);
    }

    // ─── View functions ─────────────────────────────────────────────────────────

    /// @notice Get full agent state for any address.
    function getAgent(address owner)
        external
        view
        returns (bytes memory metadata, uint256 balance, bool exists, bool autoSignEnabled)
    {
        AgentInfo storage a = agents[owner];
        return (a.metadata, a.balance, a.exists, a.autoSignEnabled);
    }

    /// @notice Check whether an agent exists.
    function hasAgent(address owner) external view returns (bool) {
        return agents[owner].exists;
    }
}
