// Generic building block: 64-bit register with a load enable (no reset). Without clock gating,
// the enable becomes a 2:1 mux in front of every flop (hold = feed q back).
module reg64_en (input clk, input en, input [63:0] d, output reg [63:0] q);
  always @(posedge clk) if (en) q <= d;
endmodule
