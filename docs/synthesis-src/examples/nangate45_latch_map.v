// Yosys's dfflibmap only maps flip-flops, so map its generic latches to the two Nangate latch cells.
module \$_DLATCH_P_ (input E, input D, output Q);   // transparent while E = 1
  DLH_X1 _TECHMAP_REPLACE_ (.D(D), .G(E), .Q(Q));
endmodule
module \$_DLATCH_N_ (input E, input D, output Q);   // transparent while E = 0
  DLL_X1 _TECHMAP_REPLACE_ (.D(D), .GN(E), .Q(Q));
endmodule
