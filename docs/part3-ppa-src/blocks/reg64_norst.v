// Generic building block: 64-bit register, no reset.
module reg64_norst (input clk, input [63:0] d, output reg [63:0] q);
  always @(posedge clk) q <= d;
endmodule
