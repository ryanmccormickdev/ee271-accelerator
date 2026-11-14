// Generic building block: 64-bit Kogge-Stone (parallel-prefix) adder. Same function as add64.v,
// different architecture: log2(64) = 6 prefix levels instead of a 64-stage carry chain.
module add64_ks (input [63:0] a, input [63:0] b, output [63:0] s);
  wire [64*7-1:0] G, P;                 // level l occupies bits [64*l +: 64]
  assign G[63:0] = a & b;
  assign P[63:0] = a ^ b;
  genvar l, i;
  generate
    for (l = 0; l < 6; l = l + 1) begin : lvl
      for (i = 0; i < 64; i = i + 1) begin : bitpos
        if (i >= (1 << l)) begin : comb
          assign G[64*(l+1) + i] = G[64*l + i] | (P[64*l + i] & G[64*l + i - (1 << l)]);
          assign P[64*(l+1) + i] = P[64*l + i] & P[64*l + i - (1 << l)];
        end else begin : pass
          assign G[64*(l+1) + i] = G[64*l + i];
          assign P[64*(l+1) + i] = P[64*l + i];
        end
      end
    end
  endgenerate
  assign s = P[63:0] ^ {G[64*6 +: 63], 1'b0};   // carry into bit i = group generate of bits i-1..0
endmodule
