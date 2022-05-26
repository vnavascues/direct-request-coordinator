// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

enum FeeType {
    FLAT,
    PERMIRYAD
}

struct Spec {
    bytes32 specId; // 32 bytes
    address operator; // 20 bytes
    uint96 payment; // 1e27 < 2^96 = 12 bytes
    uint8 minConfirmations; // 200 < 2^8 = 1 byte
    uint48 gasLimit; // < 2.81 * 10^14 = 6 bytes
    uint96 fulfillmentFee; // 1e27 < 2^96 = 12 bytes
    FeeType feeType; // uint8 = 1 byte
}

error SpecLibrary__SpecIsNotInserted(bytes32 key);

library SpecLibrary {
    struct Map {
        bytes32[] keys; // key = keccak256(abi.encodePacked(oracle, specId))
        mapping(bytes32 => Spec) keyToSpec;
        mapping(bytes32 => uint256) indexOf;
        mapping(bytes32 => bool) inserted;
    }

    function getSpec(Map storage _map, bytes32 _key) internal view returns (Spec memory) {
        return _map.keyToSpec[_key];
    }

    function getKeyAtIndex(Map storage _map, uint256 _index) internal view returns (bytes32) {
        return _map.keys[_index];
    }

    function isInserted(Map storage _map, bytes32 _key) internal view returns (bool) {
        return _map.inserted[_key];
    }

    function size(Map storage _map) internal view returns (uint256) {
        return _map.keys.length;
    }

    function remove(Map storage _map, bytes32 _key) internal {
        if (!_map.inserted[_key]) {
            revert SpecLibrary__SpecIsNotInserted(_key);
        }

        delete _map.inserted[_key];
        delete _map.keyToSpec[_key];

        uint256 index = _map.indexOf[_key];
        uint256 lastIndex = _map.keys.length - 1;
        bytes32 lastKey = _map.keys[lastIndex];

        _map.indexOf[lastKey] = index;
        delete _map.indexOf[_key];

        _map.keys[index] = lastKey;
        _map.keys.pop();
    }

    function set(
        Map storage _map,
        bytes32 _key,
        Spec calldata _spec
    ) internal {
        if (!_map.inserted[_key]) {
            _map.inserted[_key] = true;
            _map.indexOf[_key] = _map.keys.length;
            _map.keys.push(_key);
        }
        _map.keyToSpec[_key] = _spec;
    }
}
