// One signed multiply-accumulate lane at INT8 widths: 8-bit operands, 16-bit accumulator.
// Async active-low reset, like the rest of the course RTL.
module mac8_lane (
  input  logic              clk, rst_n,
  input  logic signed [7:0] a, b,
  output logic signed [15:0] acc
);
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) acc <= '0;
    else        acc <= acc + a * b;   // every operand signed: full signed product
endmodule
