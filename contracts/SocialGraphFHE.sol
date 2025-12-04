// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SocialGraphFHE is SepoliaConfig {
    struct EncryptedConnection {
        uint256 connectionId;
        euint32 encryptedFollower;   // Encrypted follower address
        euint32 encryptedFollowee;   // Encrypted followee address
        euint32 encryptedStrength;   // Encrypted connection strength
        uint256 timestamp;
    }

    struct EncryptedRecommendation {
        uint256 recommendationId;
        euint32 encryptedSuggestedUser;  // Encrypted suggested connection
        euint32 encryptedScore;         // Encrypted recommendation score
        uint256 generatedAt;
    }

    struct DecryptedRecommendation {
        address suggestedUser;
        uint32 score;
        bool isRevealed;
    }

    uint256 public connectionCount;
    uint256 public recommendationCount;
    mapping(uint256 => EncryptedConnection) public encryptedConnections;
    mapping(uint256 => EncryptedRecommendation) public encryptedRecommendations;
    mapping(uint256 => DecryptedRecommendation) public decryptedRecommendations;
    
    mapping(uint256 => uint256) private requestToConnectionId;
    mapping(uint256 => uint256) private recommendationRequestToId;
    
    event ConnectionCreated(uint256 indexed connectionId, uint256 timestamp);
    event RecommendationRequested(uint256 indexed requestId, uint256 userId);
    event RecommendationGenerated(uint256 indexed recommendationId);
    event RecommendationDecrypted(uint256 indexed recommendationId);

    modifier onlyUser(uint256 userId) {
        // Add proper user authentication in production
        _;
    }

    function createEncryptedConnection(
        euint32 encryptedFollower,
        euint32 encryptedFollowee,
        euint32 encryptedStrength
    ) public {
        connectionCount += 1;
        uint256 newConnectionId = connectionCount;
        
        encryptedConnections[newConnectionId] = EncryptedConnection({
            connectionId: newConnectionId,
            encryptedFollower: encryptedFollower,
            encryptedFollowee: encryptedFollowee,
            encryptedStrength: encryptedStrength,
            timestamp: block.timestamp
        });
        
        emit ConnectionCreated(newConnectionId, block.timestamp);
    }

    function requestConnectionRecommendation(uint256 userId) public onlyUser(userId) {
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(FHE.asEuint32(uint32(userId)));
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.generateRecommendation.selector);
        requestToConnectionId[reqId] = userId;
        
        emit RecommendationRequested(reqId, userId);
    }

    function generateRecommendation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 userId = requestToConnectionId[requestId];
        require(userId != 0, "Invalid request");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 userAddress = abi.decode(cleartexts, (uint32));
        
        // Simulate FHE recommendation algorithm (in production this would be done off-chain)
        recommendationCount += 1;
        uint256 newRecommendationId = recommendationCount;
        
        // Simplified recommendation logic
        uint32 suggestedUser = userAddress + 1; // Placeholder for demo
        uint32 score = 85; // Placeholder score
        
        encryptedRecommendations[newRecommendationId] = EncryptedRecommendation({
            recommendationId: newRecommendationId,
            encryptedSuggestedUser: FHE.asEuint32(suggestedUser),
            encryptedScore: FHE.asEuint32(score),
            generatedAt: block.timestamp
        });
        
        decryptedRecommendations[newRecommendationId] = DecryptedRecommendation({
            suggestedUser: address(uint160(suggestedUser)),
            score: score,
            isRevealed: false
        });
        
        emit RecommendationGenerated(newRecommendationId);
    }

    function requestRecommendationDecryption(uint256 recommendationId) public onlyUser(recommendationId) {
        EncryptedRecommendation storage rec = encryptedRecommendations[recommendationId];
        require(!decryptedRecommendations[recommendationId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(rec.encryptedSuggestedUser);
        ciphertexts[1] = FHE.toBytes32(rec.encryptedScore);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRecommendation.selector);
        recommendationRequestToId[reqId] = recommendationId;
    }

    function decryptRecommendation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 recommendationId = recommendationRequestToId[requestId];
        require(recommendationId != 0, "Invalid request");
        
        DecryptedRecommendation storage dRec = decryptedRecommendations[recommendationId];
        require(!dRec.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 suggestedUser, uint32 score) = abi.decode(cleartexts, (uint32, uint32));
        
        dRec.suggestedUser = address(uint160(suggestedUser));
        dRec.score = score;
        dRec.isRevealed = true;
        
        emit RecommendationDecrypted(recommendationId);
    }

    function getDecryptedRecommendation(uint256 recommendationId) public view returns (
        address suggestedUser,
        uint32 score,
        bool isRevealed
    ) {
        DecryptedRecommendation storage r = decryptedRecommendations[recommendationId];
        return (r.suggestedUser, r.score, r.isRevealed);
    }

    function getEncryptedConnection(uint256 connectionId) public view returns (
        euint32 follower,
        euint32 followee,
        euint32 strength,
        uint256 timestamp
    ) {
        EncryptedConnection storage c = encryptedConnections[connectionId];
        return (c.encryptedFollower, c.encryptedFollowee, c.encryptedStrength, c.timestamp);
    }

    function getEncryptedRecommendation(uint256 recommendationId) public view returns (
        euint32 suggestedUser,
        euint32 score,
        uint256 generatedAt
    ) {
        EncryptedRecommendation storage r = encryptedRecommendations[recommendationId];
        return (r.encryptedSuggestedUser, r.encryptedScore, r.generatedAt);
    }
}