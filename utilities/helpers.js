module.exports = {
  /**
   * Format number for propper string representation of time hours or minutes, for example 0 -> '00'
   */
  nf: number => {
    return ('0' + number).slice(-2)
  },
}
