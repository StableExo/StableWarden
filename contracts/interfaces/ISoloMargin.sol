// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface ISoloMargin {
    struct Account { address owner; uint256 number; }
    enum ActionType { Deposit, Withdraw, Transfer, Buy, Sell, Trade, Liquidate, Vaporize, Call }
    enum AssetDenomination { Wei, Par }
    enum AssetReference { Delta, Target }
    struct AssetAmount { bool sign; AssetDenomination denomination; AssetReference ref; uint256 value; }
    struct ActionArgs { ActionType actionType; uint256 accountId; AssetAmount amount; uint256 primaryMarketId; uint256 secondaryMarketId; address otherAddress; uint256 otherAccountId; bytes data; }
    function operate(Account[] memory accounts, ActionArgs[] memory actions) external;
    function getAccountWei(Account memory account, uint256 marketId) external view returns (uint256);
}

interface ICallee {
    function callFunction(address sender, ISoloMargin.Account memory accountInfo, bytes memory data) external;
}
