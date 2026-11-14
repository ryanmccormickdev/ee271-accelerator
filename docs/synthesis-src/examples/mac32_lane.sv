// One signed multiply-accumulate lane at INT32 widths: 32-bit operands, 64-bit accumulator.
module mac32_lane (
  input  logic               clk, rst_n,
  input  logic signed [31:0] a, b,
  output logic signed [63:0] acc
);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) acc <= '0;
    else        acc <= acc + a * b;
endmodule
