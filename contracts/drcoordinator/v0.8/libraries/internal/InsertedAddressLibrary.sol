// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/**
 * @title The InsertedAddressLibrary library.
 * @author Víctor Navascués.
 * @notice An iterable mapping library for addresses. Useful to either grant or revoke by address whilst keeping track
 * of them.
 */
library InsertedAddressLibrary {
    error InsertedAddressLibrary__AddressAlreadyInserted(address key);
    error InsertedAddressLibrary__AddressIsNotInserted(address key);

    struct Map {
        address[] keys;
        mapping(address => uint256) indexOf;
        mapping(address => bool) inserted;
    }

    /* ========== INTERNAL FUNCTIONS ========== */

    /**
     * @notice Deletes an address by key.
     * @dev Reverts if the address is not inserted.
     * @param _self The reference to this iterable mapping.
     * @param _key The address to be removed.
     */
    function _remove(Map storage _self, address _key) internal {
        if (!_self.inserted[_key]) {
            revert InsertedAddressLibrary__AddressIsNotInserted(_key);
        }
        delete _self.inserted[_key];

        uint256 index = _self.indexOf[_key];
        uint256 lastIndex = _self.keys.length - 1;
        address lastKey = _self.keys[lastIndex];

        _self.indexOf[lastKey] = index;
        delete _self.indexOf[_key];

        _self.keys[index] = lastKey;
        _self.keys.pop();
    }

    /**
     * @notice Adds an address.
     * @param _self The reference to this iterable mapping.
     * @param _key The address to be added.
     */
    function _add(Map storage _self, address _key) internal {
        if (_self.inserted[_key]) {
            revert InsertedAddressLibrary__AddressAlreadyInserted(_key);
        }
        _self.inserted[_key] = true;
        _self.indexOf[_key] = _self.keys.length;
        _self.keys.push(_key);
    }

    /* ========== INTERNAL VIEW FUNCTIONS ========== */

    /**
     * @notice Returns whether the address (key) is inserted.
     * @param _self The reference to this iterable mapping.
     * @param _key The address (key).
     * @return Whether the address is inserted.
     */
    function _isInserted(Map storage _self, address _key) internal view returns (bool) {
        return _self.inserted[_key];
    }

    /**
     * @notice Returns the amount of addresses (keys) inserted.
     * @param _self The reference to this iterable mapping.
     * @return The amount of addresses inserted.
     */
    function _size(Map storage _self) internal view returns (uint256) {
        return _self.keys.length;
    }
}
