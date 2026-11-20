// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Role, Status, EvidenceKind, ClaimOutcome, IBonaChainRoles} from "./BonaChainTypes.sol";

/// @title InstitutionOperations
/// @notice The report and repair trail of ONE institution: reports, evidence fingerprints,
///         interim protection, repair claims and independent reviews. It behaves like
///         BonaRegistry, scoped to a single institution. "A report is not protection.
///         A repair claim is not verification."
/// @dev Privacy: only 32-byte fingerprints and role metadata are stored. No photos, names
///      or free text.
///
///      Life of a report:
///
///        Reported -> Acknowledged -> RepairClaimed -> Verified   (final)
///                         ^               |
///                         |               v
///                         +---(new claim)-- Disputed
///
///      Roles are not stored here. Every action asks the factory which role the caller
///      holds for this institution.
///
///      Only an independent reviewer can close a repair. An account that administers the
///      institution, or that ever acted for it on the report (acknowledged it, recorded
///      protection, claimed a repair), can never verify or dispute that report.
///
///      The seven events are the BonaRegistry events, unchanged. Where BonaRegistry put
///      the school id, this contract puts its institution id.
contract InstitutionOperations {
    // ------------------------------------------------------------------ types

    struct Report {
        bytes32 schoolId; // always this contract's institutionId
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

    error ZeroValue();
    /// @notice The caller does not hold the role this action needs for this institution.
    error Unauthorized(address account, Role required);
    error ReportAlreadyRegistered(bytes32 reportId);
    error DuplicateCommitment(bytes32 commitment, bytes32 existingReportId);
    error ReportNotFound(bytes32 reportId);
    error InvalidState(bytes32 reportId, Status current);
    error DuplicateEvidence(bytes32 reportId, bytes32 digest);
    error DuplicateProtection(bytes32 reportId, bytes32 commitment);
    /// @notice The caller administers this institution or has acted for it on this report,
    ///         so it may not act as the independent reviewer.
    error SchoolAdminCannotVerify(address account, bytes32 reportId);

    // ---------------------------------------------------------------- storage

    /// @notice The factory that created this contract and holds the roles.
    IBonaChainRoles public immutable factory;
    /// @notice The one institution this contract serves.
    bytes32 public immutable institutionId;

    mapping(bytes32 reportId => Report) private _reports;
    /// @notice The report that a report fingerprint belongs to (zero if unknown).
    mapping(bytes32 commitment => bytes32 reportId) public reportIdByCommitment;

    mapping(bytes32 reportId => Evidence[]) private _evidence;
    /// @dev index + 1, so 0 means "not registered".
    mapping(bytes32 reportId => mapping(bytes32 digest => uint256)) private _evidencePos;

    mapping(bytes32 reportId => RepairClaim[]) private _claims;
    mapping(bytes32 reportId => ProtectionRecord[]) private _protections;
    mapping(bytes32 reportId => mapping(bytes32 commitment => bool)) private _protectionSeen;

    /// @notice True once `account` has acknowledged, recorded protection for, or claimed a
    ///         repair on `reportId`. It stays true after the role is revoked, so a former
    ///         school administrator cannot come back as the reviewer of that report.
    mapping(bytes32 reportId => mapping(address account => bool)) public hasActedForSchool;

    /// @notice True once `account` has verified or disputed a repair claim on `reportId`.
    ///         The finance contract reads it so a reviewer of a report can never be the
    ///         one who authorises the release for that report.
    mapping(bytes32 reportId => mapping(address account => bool)) public hasReviewed;

    // ------------------------------------------------------------ constructor

    /// @param factory_       The BonaChainFactory that holds the roles.
    /// @param institutionId_ The institution this contract serves.
    constructor(address factory_, bytes32 institutionId_) {
        if (factory_ == address(0) || institutionId_ == bytes32(0)) revert ZeroValue();
        factory = IBonaChainRoles(factory_);
        institutionId = institutionId_;
    }

    // ---------------------------------------------------------------- reports

    /// @notice Anchor a new report. Registrar only.
    /// @param reportId   Opaque unique id chosen off chain.
    /// @param commitment SHA-256 of the salted report document kept off chain.
    function registerReport(bytes32 reportId, bytes32 commitment) external {
        if (reportId == bytes32(0) || commitment == bytes32(0)) revert ZeroValue();
        _requireRole(Role.Registrar);
        if (_reports[reportId].status != Status.None) revert ReportAlreadyRegistered(reportId);
        bytes32 existing = reportIdByCommitment[commitment];
        if (existing != bytes32(0)) revert DuplicateCommitment(commitment, existing);

        uint64 nowTs = uint64(block.timestamp);
        _reports[reportId] = Report({
            schoolId: institutionId,
            commitment: commitment,
            registrar: msg.sender,
            registeredAt: nowTs,
            status: Status.Reported,
            acknowledgedBy: address(0),
            acknowledgedAt: 0
        });
        reportIdByCommitment[commitment] = reportId;
        emit ReportRegistered(reportId, institutionId, commitment, msg.sender, nowTs);
    }

    /// @notice Add an evidence fingerprint to a report. Records are never edited or removed.
    /// @dev The role needed depends on `kind`: Report -> Registrar, Repair -> SchoolAdmin,
    ///      Review -> Reviewer. Refused once the report is Verified (final).
    function registerEvidence(bytes32 reportId, bytes32 digest, EvidenceKind kind) external {
        if (digest == bytes32(0)) revert ZeroValue();
        Report storage report = _load(reportId);
        if (report.status == Status.Verified) revert InvalidState(reportId, report.status);

        Role required = kind == EvidenceKind.Report
            ? Role.Registrar
            : kind == EvidenceKind.Repair
                ? Role.SchoolAdmin
                : Role.Reviewer;
        _requireRole(required);
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

    /// @notice The school administrator confirms the institution has seen the report.
    function acknowledgeReport(bytes32 reportId) external {
        Report storage report = _load(reportId);
        _requireRole(Role.SchoolAdmin);
        if (report.status != Status.Reported) revert InvalidState(reportId, report.status);

        uint64 nowTs = uint64(block.timestamp);
        report.status = Status.Acknowledged;
        report.acknowledgedBy = msg.sender;
        report.acknowledgedAt = nowTs;
        hasActedForSchool[reportId][msg.sender] = true;
        emit ReportAcknowledged(reportId, institutionId, msg.sender, nowTs);
    }

    /// @notice The school administrator records what was done to keep people safe while
    ///         the repair is outstanding (for example, an area was closed off). This never
    ///         changes the status: protection is not a repair.
    /// @param commitment SHA-256 of the interim-protection document kept off chain.
    function recordInterimProtection(bytes32 reportId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        Report storage report = _load(reportId);
        _requireRole(Role.SchoolAdmin);
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

    /// @notice The school administrator claims the repair is done. This does NOT close the
    ///         report: only an independent reviewer can, through `verifyRepair`.
    /// @param commitment SHA-256 of the repair-claim document kept off chain.
    function claimRepair(bytes32 reportId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        Report storage report = _load(reportId);
        _requireRole(Role.SchoolAdmin);
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

    /// @notice The independent reviewer confirms the repair. Final: this closes the report.
    /// @param reviewCommitment SHA-256 of the review document kept off chain.
    function verifyRepair(bytes32 reportId, bytes32 reviewCommitment) external {
        (Report storage report, RepairClaim storage claim, uint256 claimIndex) = _review(
            reportId,
            reviewCommitment,
            ClaimOutcome.Verified
        );
        report.status = Status.Verified;
        emit RepairVerified(reportId, claimIndex, reviewCommitment, msg.sender, claim.reviewedAt);
    }

    /// @notice The independent reviewer rejects the repair claim. The school may claim again.
    /// @param reviewCommitment SHA-256 of the reasons document kept off chain.
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

    /// @notice The stored record of a report (all zero if the report is unknown).
    function getReport(bytes32 reportId) external view returns (Report memory) {
        return _reports[reportId];
    }

    /// @notice The current status of a report (None if the report is unknown).
    function statusOf(bytes32 reportId) external view returns (Status) {
        return _reports[reportId].status;
    }

    /// @notice How many evidence fingerprints a report has.
    function evidenceCount(bytes32 reportId) external view returns (uint256) {
        return _evidence[reportId].length;
    }

    /// @notice One evidence record of a report, by position.
    function getEvidence(bytes32 reportId, uint256 index) external view returns (Evidence memory) {
        return _evidence[reportId][index];
    }

    /// @notice True if this fingerprint is already recorded as evidence for the report.
    function isEvidenceRegistered(bytes32 reportId, bytes32 digest) external view returns (bool) {
        return _evidencePos[reportId][digest] != 0;
    }

    /// @notice How many interim protection records a report has.
    function protectionCount(bytes32 reportId) external view returns (uint256) {
        return _protections[reportId].length;
    }

    /// @notice One interim protection record of a report, by position.
    function getProtection(
        bytes32 reportId,
        uint256 index
    ) external view returns (ProtectionRecord memory) {
        return _protections[reportId][index];
    }

    /// @notice How many repair claims a report has.
    function claimCount(bytes32 reportId) external view returns (uint256) {
        return _claims[reportId].length;
    }

    /// @notice One repair claim of a report, by position, with its review if it has one.
    function getClaim(bytes32 reportId, uint256 index) external view returns (RepairClaim memory) {
        return _claims[reportId][index];
    }

    // -------------------------------------------------------------- internals

    function _load(bytes32 reportId) private view returns (Report storage report) {
        report = _reports[reportId];
        if (report.status == Status.None) revert ReportNotFound(reportId);
    }

    function _requireRole(Role required) private view {
        if (factory.roleOf(institutionId, msg.sender) != required) {
            revert Unauthorized(msg.sender, required);
        }
    }

    /// @dev Shared gate for verify and dispute. The conflict-of-interest check runs before
    ///      the role check, so a school administrator gets the specific refusal.
    function _review(
        bytes32 reportId,
        bytes32 reviewCommitment,
        ClaimOutcome outcome
    ) private returns (Report storage report, RepairClaim storage claim, uint256 claimIndex) {
        if (reviewCommitment == bytes32(0)) revert ZeroValue();
        report = _load(reportId);
        Role held = factory.roleOf(institutionId, msg.sender);
        if (held == Role.SchoolAdmin || hasActedForSchool[reportId][msg.sender]) {
            revert SchoolAdminCannotVerify(msg.sender, reportId);
        }
        if (held != Role.Reviewer) revert Unauthorized(msg.sender, Role.Reviewer);
        if (report.status != Status.RepairClaimed) revert InvalidState(reportId, report.status);

        RepairClaim[] storage claims = _claims[reportId];
        claimIndex = claims.length - 1;
        claim = claims[claimIndex];
        claim.outcome = outcome;
        claim.reviewer = msg.sender;
        claim.reviewedAt = uint64(block.timestamp);
        claim.reviewCommitment = reviewCommitment;
        hasReviewed[reportId][msg.sender] = true;
    }
}
