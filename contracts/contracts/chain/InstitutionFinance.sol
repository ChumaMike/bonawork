// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {
    Role,
    Status,
    OrderStatus,
    IBonaChainRoles,
    IInstitutionOperationsStatus
} from "./BonaChainTypes.sol";

/// @title InstitutionFinance
/// @notice The procurement trail of ONE institution, tied to its reports:
///
///           work order approved (buyer) -> order acknowledged (supplier)
///           -> invoice submitted (supplier) -> goods receipt recorded (receiver)
///           -> three-way match recorded (platform) -> release authorised (payment approver)
///
///         No money moves here. The last step is a release INSTRUCTION, and it is only
///         accepted when the order, the invoice and the goods receipt match, nobody has
///         an open payment dispute, and an independent reviewer has verified the repair.
/// @dev Privacy: only 32-byte fingerprints and role metadata are stored. No amounts, no
///      supplier names, no documents.
///
///      Separation of duties. Roles live in the factory (one role per account per
///      institution). On top of that this contract remembers, per work order, the role
///      each account first acted under (`actedAs`). Acting on the same order under a
///      different role is refused for ever, even after the factory role was changed.
///
///      Current match. A match result only counts for the latest invoice, and only while
///      no goods receipt was recorded after it. A new invoice or a new goods receipt
///      voids the match; the platform must record a fresh one.
///
///      Nothing in this contract changes the status of a report.
contract InstitutionFinance {
    // ------------------------------------------------------------------ types

    struct WorkOrder {
        bytes32 reportId; // the report this order repairs
        bytes32 commitment; // fingerprint of the work order document
        OrderStatus status;
        bool disputeOpen; // a payment dispute is open: release is blocked
        bool matchPassed; // the current match exists and passed
        address buyer; // who approved the order
        uint64 approvedAt;
        address supplier; // who acknowledged the order; only this account may invoice
        uint64 acknowledgedAt;
        uint32 invoiceCount;
        address disputeOpener; // who opened the open dispute (zero if none is open)
        uint32 receiptCount;
        address releasedBy; // who authorised the release instruction
        uint64 releasedAt;
        bytes32 latestInvoice; // fingerprint of the latest invoice (zero if none)
        bytes32 latestReceipt; // fingerprint of the latest goods receipt (zero if none)
        bytes32 currentMatch; // fingerprint of the current match result (zero if none or voided)
        bytes32 releaseCommitment; // fingerprint of the release decision (zero until authorised)
    }

    // ----------------------------------------------------------------- events

    event WorkOrderApproved(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );
    event WorkOrderAcknowledged(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        address indexed actor,
        uint64 timestamp
    );
    event InvoiceSubmitted(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        uint256 invoiceIndex,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );
    event GoodsReceiptRecorded(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        uint256 receiptIndex,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );
    event MatchRecorded(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        bytes32 invoiceCommitment,
        bool passed,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );
    event PaymentDisputeOpened(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );
    event PaymentDisputeClosed(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );
    event ReleaseAuthorised(
        bytes32 indexed workOrderId,
        bytes32 indexed reportId,
        bytes32 commitment,
        address indexed actor,
        uint64 timestamp
    );

    // ----------------------------------------------------------------- errors

    error ZeroValue();
    /// @notice The caller does not hold the role this action needs, or is not the
    ///         specific account the action is reserved for.
    error Unauthorized(address account, Role required);
    /// @notice The caller already acted on this order (or on its report) in another
    ///         capacity, so it may not take this step.
    error SeparationOfDuties(address account, bytes32 workOrderId);
    error WorkOrderAlreadyExists(bytes32 workOrderId);
    error WorkOrderNotFound(bytes32 workOrderId);
    error ReportNotFound(bytes32 reportId);
    error InvalidOrderState(bytes32 workOrderId, OrderStatus current);
    /// @notice This fingerprint was already recorded in this contract.
    error DuplicateCommitment(bytes32 commitment);
    /// @notice The match names an invoice that is not the latest one.
    error StaleInvoice(bytes32 invoiceCommitment);
    error NoInvoice(bytes32 workOrderId);
    error NoGoodsReceipt(bytes32 workOrderId);
    /// @notice There is no current match, or the current match did not pass.
    error MatchNotPassing(bytes32 workOrderId);
    error DisputeOpen(bytes32 workOrderId);
    error NoOpenDispute(bytes32 workOrderId);
    /// @notice The repair has not been verified by an independent reviewer.
    ///         `status` is the report status as a number (see the Status enum).
    error RepairNotVerified(bytes32 reportId, uint8 status);

    // ---------------------------------------------------------------- storage

    /// @notice The factory that created this contract and holds the roles.
    IBonaChainRoles public immutable factory;
    /// @notice The one institution this contract serves.
    bytes32 public immutable institutionId;
    /// @notice The operations contract of the same institution (reports and reviews).
    IInstitutionOperationsStatus public immutable operations;

    mapping(bytes32 workOrderId => WorkOrder) private _orders;
    mapping(bytes32 commitment => bool) private _commitmentUsed;

    /// @notice The role `account` first acted under on `workOrderId` (None if it never
    ///         acted). It never changes, so one account can never play two parts in the
    ///         same order.
    mapping(bytes32 workOrderId => mapping(address account => Role)) public actedAs;

    // ------------------------------------------------------------ constructor

    /// @param factory_       The BonaChainFactory that holds the roles.
    /// @param institutionId_ The institution this contract serves.
    /// @param operations_    The operations contract of the same institution.
    constructor(address factory_, bytes32 institutionId_, address operations_) {
        if (factory_ == address(0) || institutionId_ == bytes32(0) || operations_ == address(0)) {
            revert ZeroValue();
        }
        factory = IBonaChainRoles(factory_);
        institutionId = institutionId_;
        operations = IInstitutionOperationsStatus(operations_);
    }

    // ------------------------------------------------------------ work orders

    /// @notice The buyer approves a work order for a report of this institution.
    /// @param workOrderId Opaque unique id chosen off chain.
    /// @param reportId    The report the work is for. It must exist in the operations contract.
    /// @param commitment  SHA-256 of the salted work order document kept off chain.
    function approveWorkOrder(bytes32 workOrderId, bytes32 reportId, bytes32 commitment) external {
        if (workOrderId == bytes32(0) || reportId == bytes32(0) || commitment == bytes32(0)) {
            revert ZeroValue();
        }
        if (_heldRole() != Role.Buyer) revert Unauthorized(msg.sender, Role.Buyer);
        WorkOrder storage order = _orders[workOrderId];
        if (order.status != OrderStatus.None) revert WorkOrderAlreadyExists(workOrderId);
        if (operations.statusOf(reportId) == Status.None) revert ReportNotFound(reportId);
        _useCommitment(commitment);

        uint64 nowTs = uint64(block.timestamp);
        order.reportId = reportId;
        order.commitment = commitment;
        order.status = OrderStatus.Approved;
        order.buyer = msg.sender;
        order.approvedAt = nowTs;
        actedAs[workOrderId][msg.sender] = Role.Buyer;
        emit WorkOrderApproved(workOrderId, reportId, commitment, msg.sender, nowTs);
    }

    /// @notice A supplier accepts the order. From now on only this supplier account may
    ///         submit invoices for it.
    function acknowledgeWorkOrder(bytes32 workOrderId) external {
        WorkOrder storage order = _enter(workOrderId, Role.Supplier);
        if (order.status != OrderStatus.Approved) {
            revert InvalidOrderState(workOrderId, order.status);
        }

        uint64 nowTs = uint64(block.timestamp);
        order.status = OrderStatus.Acknowledged;
        order.supplier = msg.sender;
        order.acknowledgedAt = nowTs;
        emit WorkOrderAcknowledged(workOrderId, order.reportId, msg.sender, nowTs);
    }

    /// @notice The supplier bound to the order submits an invoice. A new invoice replaces
    ///         the earlier one as "the latest" and voids any match recorded so far.
    /// @param commitment SHA-256 of the salted invoice document kept off chain.
    function submitInvoice(bytes32 workOrderId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        WorkOrder storage order = _enter(workOrderId, Role.Supplier);
        if (order.status != OrderStatus.Acknowledged) {
            revert InvalidOrderState(workOrderId, order.status);
        }
        if (msg.sender != order.supplier) revert Unauthorized(msg.sender, Role.Supplier);
        _useCommitment(commitment);

        uint64 nowTs = uint64(block.timestamp);
        uint32 index = order.invoiceCount;
        order.invoiceCount = index + 1;
        order.latestInvoice = commitment;
        _voidMatch(order);
        emit InvoiceSubmitted(workOrderId, order.reportId, index, commitment, msg.sender, nowTs);
    }

    /// @notice The receiving officer records that goods or work were received. A receipt
    ///         recorded after a match voids that match, because the match did not see it.
    /// @param commitment SHA-256 of the salted goods receipt document kept off chain.
    function recordGoodsReceipt(bytes32 workOrderId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        WorkOrder storage order = _enter(workOrderId, Role.Receiver);
        _requireOpenOrder(workOrderId, order);
        _useCommitment(commitment);

        uint64 nowTs = uint64(block.timestamp);
        uint32 index = order.receiptCount;
        order.receiptCount = index + 1;
        order.latestReceipt = commitment;
        _voidMatch(order);
        emit GoodsReceiptRecorded(
            workOrderId,
            order.reportId,
            index,
            commitment,
            msg.sender,
            nowTs
        );
    }

    /// @notice The platform relayer records the outcome of the three-way match (order,
    ///         invoice, goods receipt) computed by the rule engine off chain.
    /// @param invoiceCommitment The invoice that was matched. It must be the latest one.
    /// @param passed            True if order, invoice and receipt agree exactly.
    /// @param commitment        SHA-256 of the salted match result document kept off chain.
    function recordMatchResult(
        bytes32 workOrderId,
        bytes32 invoiceCommitment,
        bool passed,
        bytes32 commitment
    ) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        WorkOrder storage order = _enter(workOrderId, Role.Registrar);
        if (order.status != OrderStatus.Acknowledged) {
            revert InvalidOrderState(workOrderId, order.status);
        }
        if (order.invoiceCount == 0) revert NoInvoice(workOrderId);
        if (invoiceCommitment != order.latestInvoice) revert StaleInvoice(invoiceCommitment);
        _useCommitment(commitment);

        uint64 nowTs = uint64(block.timestamp);
        order.currentMatch = commitment;
        order.matchPassed = passed;
        emit MatchRecorded(
            workOrderId,
            order.reportId,
            invoiceCommitment,
            passed,
            commitment,
            msg.sender,
            nowTs
        );
    }

    // --------------------------------------------------------------- disputes

    /// @notice The buyer or the receiving officer raises a payment dispute. While it is
    ///         open, the release cannot be authorised.
    /// @param commitment SHA-256 of the salted dispute document kept off chain.
    function openPaymentDispute(bytes32 workOrderId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        WorkOrder storage order = _load(workOrderId);
        Role held = _heldRole();
        Role required = held == Role.Receiver ? Role.Receiver : Role.Buyer;
        _actAs(workOrderId, required, held);
        _requireOpenOrder(workOrderId, order);
        if (order.disputeOpen) revert DisputeOpen(workOrderId);
        _useCommitment(commitment);

        order.disputeOpen = true;
        order.disputeOpener = msg.sender;
        emit PaymentDisputeOpened(
            workOrderId,
            order.reportId,
            commitment,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /// @notice The account that opened the dispute closes it. Nobody else can.
    /// @param commitment SHA-256 of the salted closing document kept off chain.
    function closePaymentDispute(bytes32 workOrderId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        WorkOrder storage order = _load(workOrderId);
        if (!order.disputeOpen) revert NoOpenDispute(workOrderId);
        address opener = order.disputeOpener;
        Role required = actedAs[workOrderId][opener];
        _actAs(workOrderId, required, _heldRole());
        if (msg.sender != opener) revert Unauthorized(msg.sender, required);
        _useCommitment(commitment);

        order.disputeOpen = false;
        order.disputeOpener = address(0);
        emit PaymentDisputeClosed(
            workOrderId,
            order.reportId,
            commitment,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    // ---------------------------------------------------------------- release

    /// @notice The payment approver authorises the release instruction. This is the last
    ///         step and it can happen once. It moves no money.
    /// @dev The checks run in this exact order, and the first one that fails is reported:
    ///      WorkOrderNotFound -> SeparationOfDuties -> Unauthorized -> InvalidOrderState ->
    ///      NoInvoice -> NoGoodsReceipt -> MatchNotPassing -> DisputeOpen -> RepairNotVerified.
    ///      (A zero commitment is refused before all of them, a reused one after all of them.)
    ///
    ///      SeparationOfDuties also covers the report side: an account that acted for the
    ///      institution on the report, or reviewed its repair, can never authorise.
    /// @param commitment SHA-256 of the salted release decision document kept off chain.
    function authoriseRelease(bytes32 workOrderId, bytes32 commitment) external {
        if (commitment == bytes32(0)) revert ZeroValue();
        WorkOrder storage order = _load(workOrderId);
        bytes32 reportId = order.reportId;
        if (
            operations.hasActedForSchool(reportId, msg.sender) ||
            operations.hasReviewed(reportId, msg.sender)
        ) {
            revert SeparationOfDuties(msg.sender, workOrderId);
        }
        _actAs(workOrderId, Role.PaymentApprover, _heldRole());
        if (order.status != OrderStatus.Acknowledged) {
            revert InvalidOrderState(workOrderId, order.status);
        }
        if (order.invoiceCount == 0) revert NoInvoice(workOrderId);
        if (order.receiptCount == 0) revert NoGoodsReceipt(workOrderId);
        if (!order.matchPassed) revert MatchNotPassing(workOrderId);
        if (order.disputeOpen) revert DisputeOpen(workOrderId);
        Status reportStatus = operations.statusOf(reportId);
        if (reportStatus != Status.Verified) {
            revert RepairNotVerified(reportId, uint8(reportStatus));
        }
        _useCommitment(commitment);

        uint64 nowTs = uint64(block.timestamp);
        order.status = OrderStatus.ReleaseAuthorised;
        order.releasedBy = msg.sender;
        order.releasedAt = nowTs;
        order.releaseCommitment = commitment;
        emit ReleaseAuthorised(workOrderId, reportId, commitment, msg.sender, nowTs);
    }

    // ------------------------------------------------------------------ views

    /// @notice The stored record of a work order (all zero if the order is unknown).
    function getWorkOrder(bytes32 workOrderId) external view returns (WorkOrder memory) {
        return _orders[workOrderId];
    }

    // -------------------------------------------------------------- internals

    function _heldRole() private view returns (Role) {
        return factory.roleOf(institutionId, msg.sender);
    }

    function _load(bytes32 workOrderId) private view returns (WorkOrder storage order) {
        order = _orders[workOrderId];
        if (order.status == OrderStatus.None) revert WorkOrderNotFound(workOrderId);
    }

    /// @dev The common gate: the order exists, the caller never acted on it under another
    ///      role, and the caller holds the role now. Remembers the role on first use.
    function _enter(
        bytes32 workOrderId,
        Role required
    ) private returns (WorkOrder storage order) {
        order = _load(workOrderId);
        _actAs(workOrderId, required, _heldRole());
    }

    /// @dev Separation of duties first, then the role check. A later revert in the caller
    ///      undoes the note written here.
    function _actAs(bytes32 workOrderId, Role required, Role held) private {
        Role prior = actedAs[workOrderId][msg.sender];
        if (prior != Role.None && prior != required) {
            revert SeparationOfDuties(msg.sender, workOrderId);
        }
        if (held != required) revert Unauthorized(msg.sender, required);
        if (prior == Role.None) actedAs[workOrderId][msg.sender] = required;
    }

    /// @dev Once the release is authorised the order is closed to further records.
    function _requireOpenOrder(bytes32 workOrderId, WorkOrder storage order) private view {
        if (order.status == OrderStatus.ReleaseAuthorised) {
            revert InvalidOrderState(workOrderId, order.status);
        }
    }

    function _useCommitment(bytes32 commitment) private {
        if (_commitmentUsed[commitment]) revert DuplicateCommitment(commitment);
        _commitmentUsed[commitment] = true;
    }

    function _voidMatch(WorkOrder storage order) private {
        order.currentMatch = bytes32(0);
        order.matchPassed = false;
    }
}
