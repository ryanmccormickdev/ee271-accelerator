// Generic building block: 64-bit register with asynchronous active-low reset.
module reg64_arst (input clk, input rst_n, input [63:0] d, output reg [63:0] q);
  always @(posedge clk or negedge rst_n)
    if (!rst_n) q <= 64'd0;
    else        q <= d;
endmodule
