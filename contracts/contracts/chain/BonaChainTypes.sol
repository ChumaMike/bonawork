// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Shared types for the Bona Chain suite (BonaChainFactory, InstitutionOperations,
// InstitutionFinance). Only 32-byte fingerprints and role metadata ever go on chain:
// no amounts, no names, no documents.

/// @notice The one role an account can hold for one institution. Holding one role
///         excludes all the others, so the same key can never both order and authorise,
///         or both claim a repair and verify it.
enum Role {
    None,
    Registrar, // platform relayer: anchors reports and records match results
    SchoolAdmin, // acknowledges reports, records protection, claims repairs
    Reviewer, // independently verifies or disputes a repair claim
    Buyer, // approves a work order
    Supplier, // acknowledges the order and submits invoices
    Receiver, // records that goods or work were received
    PaymentApprover // authorises the release instruction
}

/// @notice What kind of Bona Chain contract an address is, as recorded by the factory.
enum Kind {
    None, // not created by this factory
    Operations,
    Finance
}

/// @notice Life of a work order. No money moves on chain: the last step is a release
///         instruction, nothing more.
enum OrderStatus {
    None,
    Approved,
    Acknowledged,
    ReleaseAuthorised
}

/// @notice Life of a report. Same values as BonaRegistry.
enum Status {
    None,
    Reported,
    Acknowledged,
    RepairClaimed,
    Verified,
    Disputed
}

/// @notice Who supplied a piece of evidence. Same values as BonaRegistry.
enum EvidenceKind {
    Report, // submitted with the original report (Registrar)
    Repair, // submitted by the school as proof of repair (SchoolAdmin)
    Review // captured by the independent reviewer (Reviewer)
}

/// @notice Result of the independent review of one repair claim. Same values as BonaRegistry.
enum ClaimOutcome {
    Pending,
    Verified,
    Disputed
}

/// @notice The part of the factory that the institution contracts read.
interface IBonaChainRoles {
    function owner() external view returns (address);

    function roleOf(bytes32 institutionId, address account) external view returns (Role);
}

/// @notice The part of the operations contract that the finance contract reads.
interface IInstitutionOperationsStatus {
    function statusOf(bytes32 reportId) external view returns (Status);

    function hasActedForSchool(bytes32 reportId, address account) external view returns (bool);

    function hasReviewed(bytes32 reportId, address account) external view returns (bool);
}
