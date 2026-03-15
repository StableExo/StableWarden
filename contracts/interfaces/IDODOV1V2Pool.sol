// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.7.0;

interface IDODOV1V2Pool {
    function sellBaseToken(uint256 amount, uint256 minReceiveQuote, bytes calldata data) external returns (uint256);
    function buyBaseToken(uint256 amount, uint256 maxPayQuote, bytes calldata data) external returns (uint256);
    function _BASE_TOKEN_() external view returns (address);
}
