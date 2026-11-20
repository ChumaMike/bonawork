// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title BonaRegistry
/// @notice Append-only ledger of school infrastructure reports, evidence digests,
///         repair claims and independent reviews for BonaBlock. First use case:
///         BonaBlock for Schools. "A report is not protection. A repair claim is not
///         verification."
/// @dev Privacy: the chain stores 32-byte digests/commitments and role metadata only.
///      No photos, names, free text or other personal information may be written here.
///      Every `bytes32` commitment/digest is computed off-chain (SHA-256 of the exact
///      bytes, as in the `verifier` package) and is opaque to this contract.
///
///      Lifecycle of a report:
///
///        Reported -> Acknowledged -> RepairClaimed -> Verified   (terminal)
///                         ^               |
///                         |               v
///                         +---(new claim)-- Disputed
///
///      Interim protection records (what the school did to keep people safe while the
///      repair is outstanding) can be appended at any point between acknowledgement and
///      verification. They never change the status: protection is not a repair.
///
///      A repair can only be closed (Verified) by an independent reviewer. An account
///      that administers the school, or that ever acted for the school on the report
///      (acknowledged it, recorded protection, claimed a repair), can never verify or
///      dispute it.
contract BonaRegistry {
    // ------------------------------------------------------------------ types

    /// @notice A single role per (school, account). Holding one role excludes the others,
    ///         so a school administrator can never also be that school's reviewer.
    enum Role {
        None,
        Registrar, // platform relayer that anchors report commitments
        SchoolAdmin, // acknowledges reports and claims repairs
        Reviewer // independently verifies or disputes repair claims
    }

    enum Status {
        None,
        Reported,
        Acknowledged,
        RepairClaimed,
        Verified,
        Disputed
    }

    enum EvidenceKind {
        Report, // submitted with the original report (Registrar)
        Repair, // submitted by the school as proof of repair (SchoolAdmin)
        Review // captured by the independent reviewer (Reviewer)
    }

    enum ClaimOutcome {
        Pending,
        Verified,
        Disputed
    }

    struct Report {
        bytes32 schoolId;
        bytes32 commitment;
        address registrar;
        uint64 registeredAt;
        Status status;
        address acknowledgedBy;
        uint64 acknowledgedAt;
    }

    struct Evidence {
        bytes32 digest;
        EvidenceKind kind;
        address submitter;
        uint64 registeredAt;
    }

    struct ProtectionRecord {
        bytes32 commitment;
        address recordedBy;
        uint64 recordedAt;
    }

    struct RepairClaim {
        bytes32 commitment;
        address claimant;
        uint64 claimedAt;
        ClaimOutcome outcome;
        address reviewer;
        uint64 reviewedAt;
        bytes32 reviewCommitment;
    }

    // ----------------------------------------------------------------- events

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SchoolRegistered(bytes32 indexed schoolId);
    event RoleGranted(bytes32 indexed schoolId, address indexed account, Role role);
    event RoleRevoked(bytes32 indexed schoolId, address indexed account, Role role);

    event ReportRegistered(
        bytes32 indexed reportId,
        bytes32 indexed schoolId,
        bytes32 commitment,
        address indexed registrar,
        uint64 timestamp
    );
    event EvidenceRegistered(
        bytes32 indexed reportId,
        bytes32 indexed digest,
        EvidenceKind kind,
        uint256 evidenceIndex,
        address indexed submitter,
        uint64 timestamp
    );
    event ReportAcknowledged(
        bytes32 indexed reportId,
        bytes32 indexed schoolId,
        address indexed schoolAdmin,
        uint64 timestamp
    );
    event InterimProtectionRecorded(
        bytes32 indexed reportId,
        uint256 indexed protectionIndex,
        bytes32 commitment,
        address indexed schoolAdmin,
        uint64 timestamp
    );
    event RepairClaimed(
        bytes32 indexed reportId,
        uint256 indexed claimIndex,
        bytes32 commitment,
        address indexed schoolAdmin,
        uint64 timestamp
    );
    event RepairVerified(
        bytes32 indexed reportId,
        uint256 indexed claimIndex,
        bytes32 reviewCommitment,
        address indexed reviewer,
        uint64 timestamp
    );
    event RepairDisputed(
        bytes32 indexed reportId,
        uint256 indexed claimIndex,
        bytes32 reviewCommitment,
        address indexed reviewer,
        uint64 timestamp
    );

    // ----------------------------------------------------------------- errors

    error NotOwner(address account);
    error NotPendingOwner(address account);
    error ZeroAddress();
    error ZeroValue();
    error InvalidRole();
    error SchoolAlreadyRegistered(bytes32 schoolId);
    error SchoolNotRegistered(bytes32 schoolId);
    error RoleConflict(bytes32 schoolId, address account, Role existing);
    error RoleNotHeld(bytes32 schoolId, address account);
    error Unauthorized(address account, bytes32 schoolId, Role required);
    error ReportAlreadyRegistered(bytes32 reportId);
    error DuplicateCommitment(bytes32 commitment, bytes32 existingReportId);
    error ReportNotFound(bytes32 reportId);
    error InvalidState(bytes32 reportId, Status current);
    error DuplicateEvidence(bytes32 reportId, bytes32 digest);
    error DuplicateProtection(bytes32 reportId, bytes32 commitment);
    /// @notice The caller administers this school or has acted for the school on this
    ///         report, so it may not act as the independent reviewer.
    error SchoolAdminCannotVerify(address account, bytes32 reportId);

    // ---------------------------------------------------------------- storage

    address public owner;
    address public pendingOwner;

    mapping(bytes32 schoolId => bool) public isSchoolRegistered;
    mapping(bytes32 schoolId => mapping(address account => Role)) public roleOf;

    mapping(bytes32 reportId => Report) private _reports;
    mapping(bytes32 commitment => bytes32 reportId) public reportIdByCommitment;

    mapping(bytes32 reportId => Evidence[]) private _evidence;
    /// @dev index + 1, so 0 means "not registered".
    mapping(bytes32 reportId => mapping(bytes32 digest => uint256)) private _evidencePos;

    mapping(bytes32 reportId => RepairClaim[]) private _claims;
    mapping(bytes32 reportId => ProtectionRecord[]) private _protections;
    mapping(bytes32 reportId => mapping(bytes32 commitment => bool)) private _protectionSeen;

    /// @notice True once `account` has acknowledged, recorded protection for, or claimed a
    ///         repair on `reportId`. Survives role revocation, so a former school
    ///         administrator cannot return as the reviewer of that report.
    mapping(bytes32 reportId => mapping(address account => bool)) public hasActedForSchool;

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

    // -------------------------------------------------------- administration

    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner(msg.sender);
        address previous = owner;
        owner = msg.sender;
        delete pendingOwner;
        emit OwnershipTransferred(previous, msg.sender);
    }

    /// @param schoolId Opaque school identifier, e.g. keccak256 of the public school code.
    function registerSchool(bytes32 schoolId) external onlyOwner {
        if (schoolId == bytes32(0)) revert ZeroValue();
        if (isSchoolRegistered[schoolId]) revert SchoolAlreadyRegistered(schoolId);
        isSchoolRegistered[schoolId] = true;
        emit SchoolRegistered(schoolId);
    }

    /// @notice Grant `role` to `account` for one school. An account holding a different
    ///         role for that school must have it revoked first.
    function grantRole(bytes32 schoolId, address account, Role role) external onlyOwner {
        if (!isSchoolRegistered[schoolId]) revert SchoolNotRegistered(schoolId);
        if (account == address(0)) revert ZeroAddress();
        if (role == Role.None) revert InvalidRole();
        Role existing = roleOf[schoolId][account];
        if (existing != Role.None) revert RoleConflict(schoolId, account, existing);
        roleOf[schoolId][account] = role;
        emit RoleGranted(schoolId, account, role);
    }

    function revokeRole(bytes32 schoolId, address account) external onlyOwner {
        Role existing = roleOf[schoolId][account];
        if (existing == Role.None) revert RoleNotHeld(schoolId, account);
        delete roleOf[schoolId][account];
        emit RoleRevoked(schoolId, account, existing);
    }

    // ---------------------------------------------------------------- reports

    /// @notice Anchor a new report.
    /// @param reportId   Opaque unique id chosen off-chain (e.g. keccak256 of a random UUID).
    /// @param commitment SHA-256 of the canonical, salted report document kept off-chain.
    function registerReport(bytes32 reportId, bytes32 schoolId, bytes32 commitment) external {
        if (reportId == bytes32(0) || commitment == bytes32(0)) revert ZeroValue();
        if (!isSchoolRegistered[schoolId]) revert SchoolNotRegistered(schoolId);
        _requireRole(schoolId, Role.Registrar);
        if (_reports[reportId].status != Status.None) revert ReportAlreadyRegistered(reportId);
        bytes32 existing = reportIdByCommitment[commitment];
        if (existing != bytes32(0)) revert DuplicateCommitment(commitment, existing);

        uint64 nowTs = uint64(block.timestamp);
        _reports[reportId] = Report({
            schoolId: schoolId,
            commitment: commitment,
            registrar: msg.sender,
            registeredAt: nowTs,
            status: Status.Reported,
            acknowledgedBy: address(0),
            acknowledgedAt: 0
        });
        reportIdByCommitment[commitment] = reportId;
        emit ReportRegistered(reportId, schoolId, commitment, msg.sender, nowTs);
    }

    /// @notice Append an evidence digest to a report. Records are never edited or removed.
    /// @dev Required role depends on `kind`: Report -> Registrar, Repair -> SchoolAdmin,
    ///      Review -> Reviewer. Rejected once the report is Verified (terminal).
    function registerEvidence(bytes32 reportId, bytes32 digest, EvidenceKind kind) external {
        if (digest == bytes32(0)) revert ZeroValue();
        Report storage report = _load(reportId);
        if (report.status == Status.Verified) revert InvalidState(reportId, report.status);

        Role required = kind == EvidenceKind.Report
            ? Role.Registrar
            : kind == EvidenceKind.Repair
                ? Role.SchoolAdmin
                : Role.Reviewer;
        _requireRole(report.schoolId, required);
        if (_evidencePos[reportId][digest] != 0) revert DuplicateEvidence(reportId, digest);

        uint64 nowTs = uint64(block.timestamp);
        Evidence[] storage list = _evidence[reportId];
        uint256 index = list.length;
        list.push(
            Evidence({digest: digest, kind: kind, submitter: msg.sender, registeredAt: nowTs})
        );
        _evidencePos[reportId][digest] = index + 1;
        emit EvidenceRegistered(reportId, digest, kind, index, msg.sender, nowTs);
    }

    /// @notice School administrator confirms the school has seen the report.
    function acknowledgeReport(bytes32 reportId) external {
        Report storage report = _load(reportId);
        _requireRole(report.schoolId, Role.SchoolAdmin);
        if (report.status != Status.Reported) revert InvalidState(reportId, report.status);

        uint64 nowTs = uint64(block.timestamp);
        report.status = Status.Acknowledged;
        report.acknowledgedBy = msg.sender;
        report.acknowledgedAt = nowTs;
        hasActedForSchool[reportId][msg.sender] = true;
        emit ReportAcknowledged(reportId, report.schoolId, msg.sender, nowTs);
    }

    /// @notice School administrator records an interim protection measure taken while the
    ///         repair is outstanding (e.g. an area was closed off). Does not change status.
    /// @param commitment SHA-256 of the off-chain interim-protection document.
    function recordInterimProtection(bytes32 reportId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        Report storage report = _load(reportId);
        _requireRole(report.schoolId, Role.SchoolAdmin);
        if (report.status == Status.Reported || report.status == Status.Verified) {
            revert InvalidState(reportId, report.status);
        }
        if (_protectionSeen[reportId][commitment]) {
            revert DuplicateProtection(reportId, commitment);
        }

        uint64 nowTs = uint64(block.timestamp);
        ProtectionRecord[] storage list = _protections[reportId];
        uint256 index = list.length;
        list.push(
            ProtectionRecord({commitment: commitment, recordedBy: msg.sender, recordedAt: nowTs})
        );
        _protectionSeen[reportId][commitment] = true;
        hasActedForSchool[reportId][msg.sender] = true;
        emit InterimProtectionRecorded(reportId, index, commitment, msg.sender, nowTs);
    }

    /// @notice School administrator claims the repair is complete. This does NOT close the
    ///         report: only an independent reviewer can do that via `verifyRepair`.
    /// @param commitment SHA-256 of the off-chain repair-claim document.
    function claimRepair(bytes32 reportId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        Report storage report = _load(reportId);
        _requireRole(report.schoolId, Role.SchoolAdmin);
        if (report.status != Status.Acknowledged && report.status != Status.Disputed) {
            revert InvalidState(reportId, report.status);
        }

        uint64 nowTs = uint64(block.timestamp);
        RepairClaim[] storage claims = _claims[reportId];
        uint256 claimIndex = claims.length;
        claims.push(
            RepairClaim({
                commitment: commitment,
                claimant: msg.sender,
                claimedAt: nowTs,
                outcome: ClaimOutcome.Pending,
                reviewer: address(0),
                reviewedAt: 0,
                reviewCommitment: bytes32(0)
            })
        );
        hasActedForSchool[reportId][msg.sender] = true;
        report.status = Status.RepairClaimed;
        emit RepairClaimed(reportId, claimIndex, commitment, msg.sender, nowTs);
    }

    /// @notice Independent reviewer confirms the repair. Terminal: closes the report.
    /// @param reviewCommitment SHA-256 of the off-chain review document.
    function verifyRepair(bytes32 reportId, bytes32 reviewCommitment) external {
        (Report storage report, RepairClaim storage claim, uint256 claimIndex) = _review(
            reportId,
            reviewCommitment,
            ClaimOutcome.Verified
        );
        report.status = Status.Verified;
        emit RepairVerified(reportId, claimIndex, reviewCommitment, msg.sender, claim.reviewedAt);
    }

    /// @notice Independent reviewer rejects the repair claim. The school may claim again.
    /// @param reviewCommitment SHA-256 of the off-chain dispute/reasons document.
    function disputeRepair(bytes32 reportId, bytes32 reviewCommitment) external {
        (Report storage report, RepairClaim storage claim, uint256 claimIndex) = _review(
            reportId,
            reviewCommitment,
            ClaimOutcome.Disputed
        );
        report.status = Status.Disputed;
        emit RepairDisputed(reportId, claimIndex, reviewCommitment, msg.sender, claim.reviewedAt);
    }

    // ------------------------------------------------------------------ views

    function getReport(bytes32 reportId) external view returns (Report memory) {
        return _reports[reportId];
    }

    function statusOf(bytes32 reportId) external view returns (Status) {
        return _reports[reportId].status;
    }

    function evidenceCount(bytes32 reportId) external view returns (uint256) {
        return _evidence[reportId].length;
    }

    function getEvidence(bytes32 reportId, uint256 index) external view returns (Evidence memory) {
        return _evidence[reportId][index];
    }

    function getAllEvidence(bytes32 reportId) external view returns (Evidence[] memory) {
        return _evidence[reportId];
    }

    function isEvidenceRegistered(bytes32 reportId, bytes32 digest) external view returns (bool) {
        return _evidencePos[reportId][digest] != 0;
    }

    function protectionCount(bytes32 reportId) external view returns (uint256) {
        return _protections[reportId].length;
    }

    function getProtection(
        bytes32 reportId,
        uint256 index
    ) external view returns (ProtectionRecord memory) {
        return _protections[reportId][index];
    }

    function getAllProtections(
        bytes32 reportId
    ) external view returns (ProtectionRecord[] memory) {
        return _protections[reportId];
    }

    function claimCount(bytes32 reportId) external view returns (uint256) {
        return _claims[reportId].length;
    }

    function getClaim(bytes32 reportId, uint256 index) external view returns (RepairClaim memory) {
        return _claims[reportId][index];
    }

    function getAllClaims(bytes32 reportId) external view returns (RepairClaim[] memory) {
        return _claims[reportId];
    }

    // -------------------------------------------------------------- internals

    function _load(bytes32 reportId) private view returns (Report storage report) {
        report = _reports[reportId];
        if (report.status == Status.None) revert ReportNotFound(reportId);
    }

    function _requireRole(bytes32 schoolId, Role required) private view {
        if (roleOf[schoolId][msg.sender] != required) {
            revert Unauthorized(msg.sender, schoolId, required);
        }
    }

    /// @dev Shared gate for verify/dispute. The conflict-of-interest check runs before the
    ///      role check so a school administrator gets the specific rejection.
    function _review(
        bytes32 reportId,
        bytes32 reviewCommitment,
        ClaimOutcome outcome
    ) private returns (Report storage report, RepairClaim storage claim, uint256 claimIndex) {
        if (reviewCommitment == bytes32(0)) revert ZeroValue();
        report = _load(reportId);
        if (
            roleOf[report.schoolId][msg.sender] == Role.SchoolAdmin ||
            hasActedForSchool[reportId][msg.sender]
        ) {
            revert SchoolAdminCannotVerify(msg.sender, reportId);
        }
        _requireRole(report.schoolId, Role.Reviewer);
        if (report.status != Status.RepairClaimed) revert InvalidState(reportId, report.status);

        RepairClaim[] storage claims = _claims[reportId];
        claimIndex = claims.length - 1;
        claim = claims[claimIndex];
        claim.outcome = outcome;
        claim.reviewer = msg.sender;
        claim.reviewedAt = uint64(block.timestamp);
        claim.reviewCommitment = reviewCommitment;
    }
}
