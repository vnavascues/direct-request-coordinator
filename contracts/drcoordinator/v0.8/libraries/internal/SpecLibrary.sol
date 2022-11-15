// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

enum FeeType {
    FLAT, // A fixed LINK amount
    PERMIRYAD // A dynamic LINK amount (a percentage of the `paymentPreFee`)
}

enum PaymentType {
    FLAT, // A fixed LINK amount
    PERMIRYAD // A dynamic LINK amount (a percentage of the MAX LINK payment)
}

/**
 * @notice The representation of a `directrequest` job spec for DRCoordinator requests. Composed of `directrequest`
 * spec unique fields (e.g. `specId`, `operator`) DRCoordinator specific variables to address the LINK payment, e.g.
 * `fee`, `feeType`, etc.
 * @dev Size = slot0 (32) + slot1 (32) + slot2 (18) = 82 bytes
 * @member specId The `externalJobID` (UUIDv4) as bytes32.
 * @member operator The Operator address.
 * @member payment The LINK amount that Consumer pays to Operator when requesting the job (and to be hold in escrow).
 * It depends on the `paymentType`.
 * @member paymentType The kind of `payment`; a fixed amount or a percentage of the LINK required to cover the gas costs
 * if all the `gasLimit` was used (aka. MAX LINK payment).
 * @member fee The LINK amount that DRCoordinator charges Consumer when fulfilling the request. It depends on the
 * `feeType`.
 * @member feeType The kind of `fee`; a fixed amount or a percentage of the LINK required to cover the gas costs
 * incurred.
 * @member gasLimit The amount of gas to attach to the transaction (via `gasLimit` parameter on the `ethtx` task of the
 * `directrequest` job).
 */
struct Spec {
    bytes32 specId; // 32 bytes -> slot0
    address operator; // 20 bytes -> slot1
    uint96 payment; // 1e27 < 2^96 = 12 bytes -> slot1
    PaymentType paymentType; // 1 byte -> slot2
    uint96 fee; // 1e27 < 2^96 = 12 bytes -> slot2
    FeeType feeType; // 1 byte -> slot2
    uint32 gasLimit; // < 4.295 billion = 4 bytes -> slot2
}

/**
 * @title The SpecLibrary library.
 * @author Víctor Navascués.
 * @notice An iterable mapping library for Spec.
 */
library SpecLibrary {
    error SpecLibrary__SpecIsNotInserted(bytes32 key);

    struct Map {
        bytes32[] keys; // key = keccak256(abi.encodePacked(operator, specId))
        mapping(bytes32 => Spec) keyToSpec;
        mapping(bytes32 => uint256) indexOf;
        mapping(bytes32 => bool) inserted;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice Deletes a Spec by key.
     * @dev Reverts if the Spec is not inserted.
     * @param _self The reference to this iterable mapping.
     * @param _key The Spec key.
     */
    function _remove(Map storage _self, bytes32 _key) internal {
        if (!_self.inserted[_key]) {
            revert SpecLibrary__SpecIsNotInserted(_key);
        }
        delete _self.inserted[_key];
        delete _self.keyToSpec[_key];

        uint256 index = _self.indexOf[_key];
        uint256 lastIndex = _self.keys.length - 1;
        bytes32 lastKey = _self.keys[lastIndex];

        _self.indexOf[lastKey] = index;
        delete _self.indexOf[_key];

        _self.keys[index] = lastKey;
        _self.keys.pop();
    }

    /**
     * @notice Sets (creates or updates) a Spec.
     * @param _self The reference to this iterable mapping.
     * @param _key The Spec key.
     * @param _spec The Spec data.
     */
    function _set(
        Map storage _self,
        bytes32 _key,
        Spec calldata _spec
    ) internal {
        if (!_self.inserted[_key]) {
            _self.inserted[_key] = true;
            _self.indexOf[_key] = _self.keys.length;
            _self.keys.push(_key);
        }
        _self.keyToSpec[_key] = _spec;
    }

    /* ========== INTERNAL VIEW FUNCTIONS ========== */

    /**
     * @notice Returns a Spec by key.
     * @param _self The reference to this iterable mapping.
     * @param _key The Spec key.
     * @return The Spec.
     */
    function _getSpec(Map storage _self, bytes32 _key) internal view returns (Spec memory) {
        return _self.keyToSpec[_key];
    }

    /**
     * @notice Returns the Spec key at the given index.
     * @param _self The reference to this iterable mapping.
     * @param _index The index of the keys array.
     * @return The Spec key.
     */
    function _getKeyAtIndex(Map storage _self, uint256 _index) internal view returns (bytes32) {
        return _self.keys[_index];
    }

    /**
     * @notice Returns whether there is a Spec inserted by the given key.
     * @param _self The reference to this iterable mapping.
     * @param _key The Spec key.
     * @return Whether the Spec is inserted.
     */
    function _isInserted(Map storage _self, bytes32 _key) internal view returns (bool) {
        return _self.inserted[_key];
    }

    /**
     * @notice Returns the amount of Spec inserted.
     * @param _self The reference to this iterable mapping.
     * @return The amount of Spec inserted.
     */
    function _size(Map storage _self) internal view returns (uint256) {
        return _self.keys.length;
    }
}
