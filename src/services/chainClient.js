/* global localStorage */

import Client from '@liquality/client'
import BitcoinEsploraBatchApiProvider from '@liquality/bitcoin-esplora-batch-api-provider'
import BitcoinEsploraSwapFindProvider from '@liquality/bitcoin-esplora-swap-find-provider'
import BitcoinRpcProvider from '@liquality/bitcoin-rpc-provider'
import BitcoinLedgerProvider from '@liquality/bitcoin-ledger-provider'
import BitcoinWalletApiProvider from '@liquality/bitcoin-wallet-api-provider'
import BitcoinSwapProvider from '@liquality/bitcoin-swap-provider'
import BitcoinNodeWalletProvider from '@liquality/bitcoin-node-wallet-provider'
import BitcoinRpcFeeProvider from '@liquality/bitcoin-rpc-fee-provider'
import BitcoinEarnFeeProvider from '@liquality/bitcoin-earn-fee-provider'
import BitcoinNetworks from '@liquality/bitcoin-networks'

import EthereumRpcProvider from '@liquality/ethereum-rpc-provider'
import EthereumLedgerProvider from '@liquality/ethereum-ledger-provider'
import EthereumNetworks from '@liquality/ethereum-networks'
import EthereumSwapProvider from '@liquality/ethereum-swap-provider'
import EthereumScraperSwapFindProvider from '@liquality/ethereum-scraper-swap-find-provider'
import EthereumErc20Provider from '@liquality/ethereum-erc20-provider'
import EthereumErc20SwapProvider from '@liquality/ethereum-erc20-swap-provider'
import EthereumErc20ScraperSwapFindProvider from '@liquality/ethereum-erc20-scraper-swap-find-provider'
import EthereumWalletApiProvider from '@liquality/ethereum-wallet-api-provider'
import EthereumRpcFeeProvider from '@liquality/ethereum-rpc-fee-provider'
import EthereumGasNowFeeProvider from '@liquality/ethereum-gas-now-fee-provider'

import LedgerTransportWebUSB from '@ledgerhq/hw-transport-webusb'

import config from '../config'

function getBitcoinDataProvider (btcConfig) {
  if (btcConfig.api) {
    return new BitcoinEsploraBatchApiProvider({ url: btcConfig.api.url, batchUrl: btcConfig.batchApi.url, network: BitcoinNetworks[btcConfig.network], numberOfBlockConfirmation: btcConfig.feeNumberOfBlocks })
  } else if (btcConfig.rpc) {
    return new BitcoinRpcProvider({ uri: btcConfig.rpc.url, username: btcConfig.rpc.username, password: btcConfig.rpc.password, feeBlockConfirmations: btcConfig.feeNumberOfBlocks })
  }
}

function createBtcClient (asset, wallet) {
  const btcConfig = config.assets.BTC

  const btcClient = new Client()
  if (wallet && wallet.includes('bitcoin_ledger')) {
    let addressType
    if (wallet === 'bitcoin_ledger_legacy') {
      addressType = 'legacy'
    } else if (wallet === 'bitcoin_ledger_nagive_segwit') {
      addressType = 'bech32'
    }
    const ledger = new BitcoinLedgerProvider({ Transport: LedgerTransportWebUSB, network: BitcoinNetworks[btcConfig.network], addressType })
    btcClient.addProvider(getBitcoinDataProvider(btcConfig))
    btcClient.addProvider(ledger)
  } else if (wallet === 'bitcoin_node') {
    if (btcConfig.rpc.addressType === 'p2sh-segwit') {
      throw new Error('Wrapped segwit addresses (p2sh-segwit) are currently unsupported.')
    }
    if (btcConfig.api) btcClient.addProvider(new BitcoinEsploraBatchApiProvider({ url: btcConfig.api.url, network: BitcoinNetworks[btcConfig.network], numberOfBlockConfirmation: btcConfig.feeNumberOfBlocks }))
    btcClient.addProvider(new BitcoinRpcProvider({ uri: btcConfig.rpc.url, username: btcConfig.rpc.username, password: btcConfig.rpc.password, feeBlockConfirmations: btcConfig.feeNumberOfBlocks }))
    btcClient.addProvider(new BitcoinNodeWalletProvider({ network: BitcoinNetworks[btcConfig.network], uri: btcConfig.rpc.url, username: btcConfig.rpc.username, password: btcConfig.rpc.password, addressType: btcConfig.rpc.addressType }))
  } else if (wallet === 'liquality') {
    btcClient.addProvider(getBitcoinDataProvider(btcConfig))
    btcClient.addProvider(new BitcoinWalletApiProvider({ network: BitcoinNetworks[btcConfig.network], addressType: 'bech32' }))
  } else {
    // Verify functions required when wallet not connected
    btcClient.addProvider(getBitcoinDataProvider(btcConfig))
  }
  btcClient.addProvider(new BitcoinSwapProvider({ network: BitcoinNetworks[btcConfig.network], mode: btcConfig.swapMode }))
  if (btcConfig.api) btcClient.addProvider(new BitcoinEsploraSwapFindProvider(btcConfig.api.url))

  if (BitcoinNetworks[btcConfig.network].isTestnet) btcClient.addProvider(new BitcoinRpcFeeProvider())
  else btcClient.addProvider(new BitcoinEarnFeeProvider('https://liquality.io/swap/mempool/v1/fees/recommended'))

  return btcClient
}

function createEthClient (asset, wallet) {
  const assetConfig = config.assets[asset]
  const isERC20 = assetConfig.type === 'erc20'
  const ethClient = new Client()
  ethClient.addProvider(new EthereumRpcProvider({ uri: assetConfig.rpc.url }))
  if (wallet === 'metamask') {
    ethClient.addProvider(new EthereumWalletApiProvider(window.ethereum, EthereumNetworks[assetConfig.network]))
  } else if (wallet === 'ethereum_ledger') {
    const ledger = new EthereumLedgerProvider({ network: EthereumNetworks[assetConfig.network], Transport: LedgerTransportWebUSB })

    if (window.useWebBle || localStorage.useWebBle) {
      ledger.useWebBle()
    }

    ethClient.addProvider(ledger)
  }
  if (isERC20) {
    ethClient.addProvider(new EthereumErc20Provider(assetConfig.contractAddress))
    ethClient.addProvider(new EthereumErc20SwapProvider())
  } else {
    ethClient.addProvider(new EthereumSwapProvider())
  }

  if (assetConfig.api && assetConfig.api.type === 'scraper') {
    if (isERC20) ethClient.addProvider(new EthereumErc20ScraperSwapFindProvider(assetConfig.api.url))
    else ethClient.addProvider(new EthereumScraperSwapFindProvider(assetConfig.api.url))
  }

  const FeeProvider = EthereumNetworks[assetConfig.network].isTestnet || asset === 'RBTC'
    ? EthereumRpcFeeProvider
    : EthereumGasNowFeeProvider

  ethClient.addProvider(new FeeProvider())

  return ethClient
}

const clientCreators = {
  BTC: createBtcClient,
  ETH: createEthClient,
  RBTC: createEthClient,
  erc20: createEthClient
}

const clients = {}

function getClient (asset, wallet) {
  if (!(asset in clients)) {
    clients[asset] = {}
  }
  if (wallet in clients[asset]) return clients[asset][wallet]
  const assetConfig = config.assets[asset]
  const creator = clientCreators[asset] || clientCreators[assetConfig.type]
  const client = creator(asset, wallet)
  clients[asset][wallet] = client
  return client
}

function getNetworkClient (asset, wallet) {
  const assetConfig = config.assets[asset]
  if (assetConfig.type === 'erc20') {
    return getClient('ETH', wallet)
  } else {
    return getClient(asset, wallet)
  }
}

export { getClient, getNetworkClient }
