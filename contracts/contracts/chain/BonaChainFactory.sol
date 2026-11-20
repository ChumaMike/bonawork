// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Role, Kind} from "./BonaChainTypes.sol";
import {InstitutionOperations} from "./InstitutionOperations.sol";
import {InstitutionFinance} from "./InstitutionFinance.sol";

/// @title BonaChainFactory
/// @notice The registry of Bona Chain. It creates one pair of contracts per institution
///         (an operations contract for the report and repair trail, a finance contract
///         for the procurement trail) and it holds every role.
/// @dev The institution contracts keep no role list of their own. They ask this factory
///      "what role does this account hold for my institution?" each time someone acts.
///
///      One account holds at most one role per institution. To change a role the owner
///      must revoke the old one first, on purpose.
///
///      Anyone can check that an address is a real Bona Chain contract with `isGenuine`.
contract BonaChainFactory {
    // ----------------------------------------------------------------- events

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event InstitutionCreated(
        bytes32 indexed institutionId,
        address indexed operations,
        address indexed finance
    );
    event RoleGranted(bytes32 indexed institutionId, address indexed account, Role role);
    event RoleRevoked(bytes32 indexed institutionId, address indexed account, Role role);

    // ----------------------------------------------------------------- errors

    error NotOwner(address account);
    error NotPendingOwner(address account);
    error ZeroAddress();
    error ZeroValue();
    error InvalidRole();
    error InstitutionAlreadyExists(bytes32 institutionId);
    error InstitutionNotFound(bytes32 institutionId);
    /// @notice The account already holds a role for this institution. Revoke it first.
    error RoleConflict(bytes32 institutionId, address account, Role existing);
    error RoleNotHeld(bytes32 institutionId, address account);

    // ---------------------------------------------------------------- storage

    struct Institution {
        address operations;
        address finance;
    }

    /// @notice The account that may create institutions and grant or revoke roles.
    address public owner;
    /// @notice The account invited to become owner. It must accept before anything changes.
    address public pendingOwner;

    /// @notice The role `account` holds for `institutionId` (None if it holds no role).
    mapping(bytes32 institutionId => mapping(address account => Role)) public roleOf;
    /// @notice What kind of Bona Chain contract `target` is (None if this factory did not
    ///         create it).
    mapping(address target => Kind) public kindOf;

    mapping(bytes32 institutionId => Institution) private _institutions;
    bytes32[] private _institutionIds;

    // ------------------------------------------------------------ constructor

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner(msg.sender);
        _;
    }

    // -------------------------------------------------------------- ownership

    /// @notice Step one of handing over ownership: name the new owner. Nothing changes
    ///         until that account calls `acceptOwnership`.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Step two: the named account accepts and becomes the owner.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner(msg.sender);
        address previous = owner;
        owner = msg.sender;
        delete pendingOwner;
        emit OwnershipTransferred(previous, msg.sender);
    }

    // ----------------------------------------------------------- institutions

    /// @notice Create the two contracts for a new institution.
    /// @param institutionId Opaque institution identifier (the app id as 32 bytes).
    /// @return operations The report and repair contract of the institution.
    /// @return finance    The procurement contract of the institution.
    function createInstitution(
        bytes32 institutionId
    ) external onlyOwner returns (address operations, address finance) {
        if (institutionId == bytes32(0)) revert ZeroValue();
        if (_institutions[institutionId].operations != address(0)) {
            revert InstitutionAlreadyExists(institutionId);
        }

        operations = address(new InstitutionOperations(address(this), institutionId));
        finance = address(new InstitutionFinance(address(this), institutionId, operations));

        _institutions[institutionId] = Institution({operations: operations, finance: finance});
        _institutionIds.push(institutionId);
        kindOf[operations] = Kind.Operations;
        kindOf[finance] = Kind.Finance;
        emit InstitutionCreated(institutionId, operations, finance);
    }

    /// @notice The two contracts of an institution. Both are the zero address if the
    ///         institution is unknown.
    function institutionOf(
        bytes32 institutionId
    ) external view returns (address operations, address finance) {
        Institution storage institution = _institutions[institutionId];
        return (institution.operations, institution.finance);
    }

    /// @notice True only for contracts this factory created.
    function isGenuine(address target) external view returns (bool) {
        return kindOf[target] != Kind.None;
    }

    /// @notice How many institutions exist.
    function institutionCount() external view returns (uint256) {
        return _institutionIds.length;
    }

    /// @notice The id of the institution created at position `index` (0 is the first).
    function institutionIdAt(uint256 index) external view returns (bytes32) {
        return _institutionIds[index];
    }

    // ------------------------------------------------------------------ roles

    /// @notice Give `account` one role for one institution. An account that already holds
    ///         any role there is refused: revoke first, so a role change is deliberate.
    function grantRole(bytes32 institutionId, address account, Role role) external onlyOwner {
        if (_institutions[institutionId].operations == address(0)) {
            revert InstitutionNotFound(institutionId);
        }
        if (account == address(0)) revert ZeroAddress();
        if (role == Role.None) revert InvalidRole();
        Role existing = roleOf[institutionId][account];
        if (existing != Role.None) revert RoleConflict(institutionId, account, existing);
        roleOf[institutionId][account] = role;
        emit RoleGranted(institutionId, account, role);
    }

    /// @notice Take away the role `account` holds for one institution. What the account
    ///         already did stays on record and still limits what it may do later.
    function revokeRole(bytes32 institutionId, address account) external onlyOwner {
        Role existing = roleOf[institutionId][account];
        if (existing == Role.None) revert RoleNotHeld(institutionId, account);
        delete roleOf[institutionId][account];
        emit RoleRevoked(institutionId, account, existing);
    }
}
