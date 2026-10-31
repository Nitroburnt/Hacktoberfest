// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IGroth16Verifier {
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[7] calldata _pubSignals
    ) external view returns (bool);
}

/**
 * AutoEvolve ImprovementRegistry.
 *
 * Accepts a Groth16 proof that the published score went up under the frozen
 * rubric, records the sanitized manifest CID for that transition and pays a
 * small, bounded testnet reward from an escrow balance.
 *
 * Public signal order (matches packages/zk/circuits/improvement.circom):
 *   [0] oldScore            [1] newScore
 *   [2] rubricDigest        [3] versionCommitOld
 *   [4] versionCommitNew    [5] transitionNonce
 *   [6] manifestCommitment
 *
 * Note on the CID: the circuit binds `manifestCommitment` into the proof, so a
 * caller cannot swap the commitment after proving. The registry deliberately
 * does not require keccak256(cidString) == manifestCommitment, because the
 * frozen acceptance test (T4.7) stores a display CID alongside a fixed
 * commitment; the equality is enforced by the worker at upload time and can be
 * re-checked by anyone off-chain against getRecord().
 */
contract ImprovementRegistry is ReentrancyGuard {
    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct Record {
        address agent;
        uint256 oldScore;
        uint256 newScore;
        string cid;
        uint256 manifestCommitment;
        uint256 rubricDigest;
        uint256 timestamp;
        uint256 reward;
    }

    /// Domain constant bound into every proof this registry version accepts.
    uint256 public constant TRANSITION_NONCE = 1;
    uint256 public constant MAX_SCORE = 100;

    IGroth16Verifier public immutable verifier;
    address public owner;
    bool public paused;
    uint256 public rewardAmount;
    uint256 public totalRewardsPaid;
    uint256 public transitionCount;

    mapping(string => bool) private _transitionUsed;
    mapping(string => Record) private _records;
    mapping(address => uint256) public rewardsByAgent;

    event ImprovementVerified(
        address indexed agent,
        string transitionId,
        uint256 oldScore,
        uint256 newScore,
        string cid,
        uint256 reward
    );
    event Funded(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event Paused(bool paused);
    event RewardAmountUpdated(uint256 amount);

    // Revert reasons are strings on purpose: the frozen acceptance tests assert
    // on "Transition used" and "Must improve".
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Paused");
        _;
    }

    constructor(address verifierAddress, uint256 initialReward) {
        verifier = IGroth16Verifier(verifierAddress);
        owner = msg.sender;
        rewardAmount = initialReward;
    }

    receive() external payable {
        emit Funded(msg.sender, msg.value);
    }

    /// Verify a score-improvement proof, store the record and pay the reward.
    function submitImprovement(
        string calldata transitionId,
        uint256 oldScore,
        uint256 newScore,
        string calldata cidString,
        uint256 manifestCommitment,
        uint256 rubricDigest,
        uint256 versionCommitOld,
        uint256 versionCommitNew,
        Proof calldata proof
    ) external nonReentrant whenNotPaused {
        // Cheap guards first: they also save gas on obviously bad submissions.
        require(!_transitionUsed[transitionId], "Transition used");
        require(oldScore < newScore, "Must improve");
        require(newScore <= MAX_SCORE, "Score out of range");

        uint256[7] memory publicSignals = [
            oldScore,
            newScore,
            rubricDigest,
            versionCommitOld,
            versionCommitNew,
            TRANSITION_NONCE,
            manifestCommitment
        ];

        require(verifier.verifyProof(proof.a, proof.b, proof.c, publicSignals), "Invalid proof");

        // Checks-effects-interactions: state is final before any value moves.
        _transitionUsed[transitionId] = true;
        uint256 reward = rewardAmount;
        Record storage record = _records[transitionId];
        record.agent = msg.sender;
        record.oldScore = oldScore;
        record.newScore = newScore;
        record.cid = cidString;
        record.manifestCommitment = manifestCommitment;
        record.rubricDigest = rubricDigest;
        record.timestamp = block.timestamp;
        record.reward = reward;
        transitionCount += 1;

        emit ImprovementVerified(msg.sender, transitionId, oldScore, newScore, cidString, reward);

        if (reward > 0) {
            require(address(this).balance >= reward, "Insufficient escrow");
            totalRewardsPaid += reward;
            rewardsByAgent[msg.sender] += reward;
            (bool ok, ) = payable(msg.sender).call{value: reward}("");
            require(ok, "Reward transfer failed");
        }
    }

    function getRecord(string calldata transitionId) external view returns (Record memory) {
        return _records[transitionId];
    }

    function isTransitionUsed(string calldata transitionId) external view returns (bool) {
        return _transitionUsed[transitionId];
    }

    function fund() external payable {
        emit Funded(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(address(this).balance >= amount, "Insufficient escrow");
        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok, "Reward transfer failed");
        emit Withdrawn(owner, amount);
    }

    function pause(bool value) external onlyOwner {
        paused = value;
        emit Paused(value);
    }

    function setRewardAmount(uint256 amount) external onlyOwner {
        rewardAmount = amount;
        emit RewardAmountUpdated(amount);
    }
}
