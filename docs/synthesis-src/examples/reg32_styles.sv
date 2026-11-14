// Four 32-bit registers that differ only in how they reset or load.
module reg_plain (input logic clk, input logic [31:0] d, output logic [31:0] q);
  always_ff @(posedge clk) q <= d;                              // no reset
endmodule

module reg_async (input logic clk, rst_n, input logic [31:0] d, output logic [31:0] q);
  always_ff @(posedge clk or negedge rst_n)                     // asynchronous reset
    if (!rst_n) q <= '0; else q <= d;
endmodule

module reg_sync (input logic clk, rst_n, input logic [31:0] d, output logic [31:0] q);
  always_ff @(posedge clk)                                      // synchronous reset
    if (!rst_n) q <= '0; else q <= d;
endmodule

module reg_en (input logic clk, en, input logic [31:0] d, output logic [31:0] q);
  always_ff @(posedge clk)                                      // load enable: hold when en = 0
    if (en) q <= d;
endmodule
