pragma solidity 0.4.25;

import "./ERC20.sol";
import "../Common/Upgradable.sol";

contract Gold is ERC20, Upgradable {
    uint256 constant DEVS_STAKE = 6; // 1/6

    string constant WP_IPFS_HASH = "QmfR75tK12q2LpkU5dzYqykUUpYswSiewpCbDuwYhRb6M5";

    constructor(address treasury) public {
        name = "Dragonereum Gold";
        symbol = "GOLD";
        decimals = 18;
        _mint(treasury, 1000000 * 10**18);
    }

    function remoteTransfer(address _to, uint256 _value) external onlyController {
        _transfer(tx.origin, _to, _value); // solium-disable-line security/no-tx-origin
    }

    function burn(uint256 _value) external onlyController {
        _burn(msg.sender, _value);
    }
}
